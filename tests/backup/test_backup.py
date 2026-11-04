import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "backup"))
import central_backup as backup


def config():
    return backup.settings({
        "BACKUP_DATABASE_URL": "postgresql://backup.ref:password%40encoded@host.pooler.supabase.com:5432/postgres",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "secret-test-only",
        "BACKUP_AGE_RECIPIENT": "age1" + "a" * 58,
    })


class FakeStorage:
    def __init__(self, changed=False, wrong_size=False):
        self.changed, self.wrong_size, self.lists = changed, wrong_size, 0
        self.data = {"folder/comprovante.pdf": b"%PDF test", "empty.txt": b""}

    def check_bucket(self):
        pass

    def objects(self):
        self.lists += 1
        return iter((path, {"id": path, "updated_at": "changed" if self.changed and self.lists > 1 else "original",
                            "metadata": {"size": len(data) + int(self.wrong_size)}})
                    for path, data in self.data.items())

    def download(self, path):
        response = io.BytesIO(self.data[path])
        response.headers = {"Content-Type": "application/pdf"}
        return response


@contextlib.contextmanager
def plain_output(path, recipient):
    with path.open("wb") as output:
        yield output


class BackupTests(unittest.TestCase):
    def test_missing_credentials_fail_before_connecting(self):
        with self.assertRaisesRegex(backup.BackupError, "BACKUP_DATABASE_URL"):
            backup.settings({})

    def test_tls_and_read_only_credentials_not_command_line(self):
        env = config()["pg_env"]
        self.assertEqual(env["PGPASSWORD"], "password@encoded")
        self.assertEqual(env["PGSSLMODE"], "verify-full")
        self.assertIn("default_transaction_read_only=on", env["PGOPTIONS"])

    def test_reject_transaction_pooler_and_invalid_origins(self):
        env = {"BACKUP_DATABASE_URL": "postgresql://u:p@host.pooler.supabase.com:6543/postgres",
               "SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "secret",
               "BACKUP_AGE_RECIPIENT": "age1" + "a" * 58}
        with self.assertRaises(backup.BackupError):
            backup.settings(env)
        env["BACKUP_DATABASE_URL"] = "postgresql://u:p@host:5432/postgres"
        for origin in ("http://example.com", "https://user:pass@example.com", "https://example.com/path"):
            with self.subTest(origin=origin), self.assertRaises(backup.BackupError):
                backup.settings({**env, "SUPABASE_URL": origin})

    def test_archive_contains_every_object_including_empty_and_original_path(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(backup, "encrypted_output", plain_output):
            path = Path(directory) / "storage.tar.gz"
            self.assertEqual(backup.backup_storage(config(), path, FakeStorage()), 2)
            with tarfile.open(path) as archive:
                manifest = json.load(archive.extractfile("manifest.json"))
                self.assertEqual(len(manifest["objects"]), 2)
                for entry in manifest["objects"]:
                    self.assertNotIn("..", entry["member"])
                    data = archive.extractfile(entry["member"]).read()
                    self.assertEqual(data, FakeStorage().data[entry["path"]])
                    self.assertEqual(entry["sha256"], backup.hashlib.sha256(data).hexdigest())

    def test_storage_mutation_and_truncation_fail(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(backup, "encrypted_output", plain_output):
            for storage in (FakeStorage(changed=True), FakeStorage(wrong_size=True)):
                with self.assertRaises(backup.BackupError):
                    backup.backup_storage(config(), Path(directory) / "storage.tar.gz", storage)

    def test_folder_pagination_keeps_objects_on_all_pages(self):
        storage = backup.Storage(config())
        offsets = []
        @contextlib.contextmanager
        def request(path, payload):
            offsets.append((payload["prefix"], payload["offset"]))
            if payload["prefix"] == "nested/":
                rows = [{"id": "nested-file", "name": "receipt.pdf"}]
            elif payload["offset"] == 0:
                rows = [{"id": None, "name": "nested"}] + [{"id": str(i), "name": f"{i:03}.pdf"} for i in range(99)]
            else:
                rows = [{"id": "last", "name": "last.pdf"}]
            yield io.BytesIO(json.dumps(rows).encode())
        storage.request = request
        rows = list(storage.objects())
        self.assertEqual(len(rows), 101)
        self.assertIn(("nested/", 0), offsets)
        self.assertIn(("", 100), offsets)
        self.assertIn("nested/receipt.pdf", [path for path, item in rows])

    def test_no_storage_redirect_to_third_party(self):
        self.assertIsNone(backup.NoRedirect().redirect_request(None, None, 302, "", {}, "https://attacker.test"))

    def test_failed_run_removes_partial_artifacts_and_hides_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            cfg = config()
            env = {key: "fake" for key in ("BACKUP_DATABASE_URL", "SUPABASE_URL",
                                         "SUPABASE_SERVICE_ROLE_KEY", "BACKUP_AGE_RECIPIENT")}
            env["BACKUP_OUTPUT_DIR"] = directory
            def fail(config, path):
                path.write_bytes(b"partial encrypted data")
                raise RuntimeError("sensitive-error-credential")
            stderr = io.StringIO()
            with patch.dict(os.environ, env), patch.object(backup, "settings", return_value=cfg), \
                    patch.object(backup.shutil, "which", return_value="/fake/tool"), \
                    patch.object(backup, "backup_database", fail), contextlib.redirect_stderr(stderr):
                self.assertEqual(backup.main(), 1)
            self.assertEqual(list(Path(directory).iterdir()), [])
            self.assertNotIn("sensitive-error-credential", stderr.getvalue())

    @unittest.skipUnless(shutil.which("age") and shutil.which("age-keygen"), "age não instalado")
    def test_real_encryption_roundtrip_and_tamper_detection(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            identity = directory / "recovery.key"
            subprocess.run(["age-keygen", "-o", str(identity)], check=True, capture_output=True)
            recipient = subprocess.check_output(["age-keygen", "-y", str(identity)], text=True).strip()
            cfg = {**config(), "recipient": recipient}
            destination = directory / "storage.tar.gz.age"
            backup.backup_storage(cfg, destination, FakeStorage())
            encrypted = destination.read_bytes()
            self.assertNotIn(b"comprovante.pdf", encrypted)
            decrypted = subprocess.check_output(["age", "-d", "-i", str(identity), str(destination)])
            with tarfile.open(fileobj=io.BytesIO(decrypted)) as archive:
                self.assertEqual(len(json.load(archive.extractfile("manifest.json"))["objects"]), 2)
            damaged = bytearray(encrypted)
            damaged[-1] ^= 1
            destination.write_bytes(damaged)
            result = subprocess.run(["age", "-d", "-i", str(identity), str(destination)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
