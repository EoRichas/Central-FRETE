#!/usr/bin/env python3
"""Read-only encrypted backup of Central's public schema and private Storage bucket."""
import contextlib
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request


class BackupError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def settings(env):
    required = ("BACKUP_DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BACKUP_AGE_RECIPIENT")
    for key in required:
        if not env.get(key, "").strip():
            raise BackupError(f"Configure {key}.")
    database = urllib.parse.urlsplit(env["BACKUP_DATABASE_URL"])
    if database.scheme not in ("postgres", "postgresql") or not database.hostname or not database.username:
        raise BackupError("BACKUP_DATABASE_URL inválida.")
    origin = urllib.parse.urlsplit(env["SUPABASE_URL"].strip())
    if (origin.scheme != "https" or not origin.hostname or origin.username or origin.password
            or origin.query or origin.fragment or origin.path not in ("", "/")):
        raise BackupError("SUPABASE_URL precisa ser uma origem HTTPS.")
    bucket = env.get("SUPABASE_STORAGE_BUCKET", "central-frete").strip()
    if not bucket or "/" in bucket or bucket in (".", ".."):
        raise BackupError("Bucket inválido.")
    recipient = env["BACKUP_AGE_RECIPIENT"].strip()
    if not recipient.startswith("age1") or len(recipient) != 62:
        raise BackupError("Informe a chave pública age; nunca a chave privada.")
    pg_env = dict(env)
    # Secrets stay out of command-line arguments, manifests and console output.
    pg_env.update(PGHOST=database.hostname, PGPORT=str(database.port or 5432),
                  PGUSER=urllib.parse.unquote(database.username),
                  PGPASSWORD=urllib.parse.unquote(database.password or ""),
                  PGDATABASE=urllib.parse.unquote(database.path.lstrip("/") or "postgres"),
                  PGSSLMODE="verify-full", PGSSLROOTCERT="system",
                  PGCONNECT_TIMEOUT="15", PGAPPNAME="central-readonly-backup",
                  PGOPTIONS="-c default_transaction_read_only=on")
    if "pooler" in database.hostname and pg_env["PGPORT"] == "6543":
        raise BackupError("Use Session Pooler (5432), não Transaction Pooler (6543).")
    return {"pg_env": pg_env, "origin": urllib.parse.urlunsplit((origin.scheme, origin.netloc, "", "", "")),
            "key": env["SUPABASE_SERVICE_ROLE_KEY"].strip(), "bucket": bucket, "recipient": recipient}


class Storage:
    def __init__(self, config):
        self.config = config
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        headers = {"apikey": self.config["key"], "Authorization": "Bearer " + self.config["key"],
                   "Accept-Encoding": "identity"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        try:
            return self.opener.open(urllib.request.Request(
                self.config["origin"] + "/storage/v1/" + path, body, headers), timeout=60)
        except urllib.error.HTTPError as error:
            error.close()
            raise BackupError(f"Storage respondeu HTTP {error.code}; backup incompleto.") from None
        except (urllib.error.URLError, TimeoutError):
            raise BackupError("Storage indisponível; backup incompleto.") from None

    def check_bucket(self):
        with self.request("bucket/" + urllib.parse.quote(self.config["bucket"], safe="")) as response:
            bucket = json.load(response)
        if bucket.get("public") is not False:
            raise BackupError("O bucket de comprovantes precisa ser privado.")

    def objects(self):
        prefixes, seen = [""], set()
        bucket = urllib.parse.quote(self.config["bucket"], safe="")
        while prefixes:
            prefix = prefixes.pop()
            offset = 0
            while True:
                with self.request("object/list/" + bucket, {
                    "prefix": prefix, "limit": 100, "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"},
                }) as response:
                    page = json.load(response)
                if not isinstance(page, list):
                    raise BackupError("Listagem inválida do Storage.")
                for item in page:
                    name = item.get("name")
                    if not isinstance(name, str) or not name or name in (".", "..") or "/" in name or "\\" in name:
                        raise BackupError("Nome de objeto inválido no Storage.")
                    path = prefix + name
                    if path in seen:
                        raise BackupError("Listagem repetida; backup interrompido.")
                    seen.add(path)
                    if item.get("id") is None:
                        prefixes.append(path + "/")
                    else:
                        yield path, item
                if len(page) < 100:
                    break
                offset += len(page)

    def download(self, path):
        return self.request("object/authenticated/" + urllib.parse.quote(self.config["bucket"], safe="")
                            + "/" + urllib.parse.quote(path, safe="/"))


@contextlib.contextmanager
def encrypted_output(path, recipient):
    partial = path.with_suffix(path.suffix + ".partial")
    try:
        with partial.open("xb") as output:
            with subprocess.Popen(["age", "--encrypt", "--recipient", recipient], stdin=subprocess.PIPE,
                                  stdout=output, stderr=subprocess.DEVNULL) as cipher:
                try:
                    yield cipher.stdin
                finally:
                    cipher.stdin.close()
                if cipher.wait() != 0:
                    raise BackupError("Falha na criptografia; backup incompleto.")
        os.replace(partial, path)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise


def backup_database(config, destination):
    # pg_dump takes a consistent database snapshot and only reads application tables.
    with encrypted_output(destination, config["recipient"]) as output:
        with subprocess.Popen(["pg_dump", "--format=custom", "--schema=public", "--no-owner",
                               "--no-privileges", "--no-password", "--lock-wait-timeout=10s"],
                              env=config["pg_env"], stdout=output, stderr=subprocess.DEVNULL) as dump:
            if dump.wait(timeout=1800) != 0:
                raise BackupError("pg_dump falhou. Confira conexão, versão e permissão de leitura.")
    if destination.stat().st_size < 128:
        raise BackupError("Dump vazio ou inválido.")


def add_json(archive, name, data):
    content = json.dumps(data, ensure_ascii=False, indent=2).encode()
    entry = tarfile.TarInfo(name)
    entry.size, entry.mode = len(content), 0o600
    archive.addfile(entry, io.BytesIO(content))


def backup_storage(config, destination, storage=None):
    storage = storage or Storage(config)
    storage.check_bucket()
    inventory = []
    with encrypted_output(destination, config["recipient"]) as output:
        with tarfile.open(fileobj=output, mode="w|gz") as archive:
            for path, metadata in storage.objects():
                # One temporary object at a time: memory does not grow with file sizes.
                with tempfile.TemporaryFile() as temporary:
                    digest, size = hashlib.sha256(), 0
                    with storage.download(path) as response:
                        content_type = response.headers.get("Content-Type", "application/octet-stream")
                        while chunk := response.read(1024 * 1024):
                            temporary.write(chunk)
                            digest.update(chunk)
                            size += len(chunk)
                    expected = (metadata.get("metadata") or {}).get("size")
                    if expected is not None and int(expected) != size:
                        raise BackupError("Objeto mudou durante a cópia; tente novamente.")
                    temporary.seek(0)
                    # Neutral archive names prevent path traversal during extraction.
                    member = f"objects/{len(inventory):08d}"
                    entry = tarfile.TarInfo(member)
                    entry.size, entry.mode = size, 0o600
                    archive.addfile(entry, temporary)
                    inventory.append({"path": path, "member": member, "size": size,
                                      "sha256": digest.hexdigest(), "contentType": content_type,
                                      "id": metadata.get("id"), "updatedAt": metadata.get("updated_at")})
            # A new/deleted/updated object invalidates this run instead of silently omitting it.
            after = {path: (item.get("id"), item.get("updated_at")) for path, item in storage.objects()}
            if after != {item["path"]: (item["id"], item["updatedAt"]) for item in inventory}:
                raise BackupError("Storage mudou durante a cópia; refaça o backup.")
            add_json(archive, "manifest.json", {"version": 1, "bucket": config["bucket"],
                     "objects": [{k: v for k, v in item.items() if k not in ("id", "updatedAt")}
                                 for item in inventory]})
    return len(inventory)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    output = None
    os.umask(0o077)
    try:
        config = settings(os.environ)
        if any(shutil.which(tool) is None for tool in ("age", "pg_dump")):
            raise BackupError("Instale age e pg_dump antes de executar.")
        root = Path(os.environ.get("BACKUP_OUTPUT_DIR", ".backups"))
        root.mkdir(parents=True, exist_ok=True)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        output = root / stamp
        output.mkdir()
        with tempfile.TemporaryDirectory(prefix="central-backup-ca-") as directory:
            if os.environ.get("BACKUP_DATABASE_SSL_CA", "").strip():
                certificate = Path(directory) / "root.crt"
                certificate.write_text(os.environ["BACKUP_DATABASE_SSL_CA"])
                config["pg_env"]["PGSSLROOTCERT"] = str(certificate)
            backup_database(config, output / "database.dump.age")
        count = backup_storage(config, output / "storage.tar.gz.age")
        files = {path.name: sha256(path) for path in output.glob("*.age")}
        # Written last. No successful completion marker exists for an incomplete backup.
        (output / "complete.json").write_text(json.dumps({
            "version": 1, "createdAt": stamp, "schema": "public", "storageObjects": count,
            "sha256": files, "databaseStorageAtomic": False,
        }, indent=2) + "\n")
        print("Backup criptografado concluído; banco e anexos incluídos.")
        return 0
    except Exception as error:
        # Never print exceptions from tools/HTTP/libpq: they can contain credentials or paths.
        if output is not None:
            shutil.rmtree(output, ignore_errors=True)
        reason = str(error) if isinstance(error, BackupError) else "Confira configuração, acesso ao banco/Storage e ferramentas."
        print("Backup falhou; nenhuma cópia parcial será publicada. " + reason, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
