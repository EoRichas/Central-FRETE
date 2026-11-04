#!/usr/bin/env python3
"""Verify encrypted archives locally without database connections or restoring production."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
from central_backup import BackupError, sha256


def verify(directory, identity):
    complete = json.loads((directory / "complete.json").read_text())
    files = complete["sha256"]
    if set(files) != {"database.dump.age", "storage.tar.gz.age"}:
        raise BackupError("Conjunto de arquivos incompleto.")
    for name, checksum in files.items():
        if sha256(directory / name) != checksum:
            raise BackupError("Checksum divergente.")
    command = ["age", "--decrypt", "--identity", str(identity)]
    with subprocess.Popen(command + [str(directory / "database.dump.age")],
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as decrypt:
        with subprocess.Popen(["pg_restore", "--list"], stdin=decrypt.stdout,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as restore:
            decrypt.stdout.close()
            if restore.wait() != 0 or decrypt.wait() != 0:
                raise BackupError("Dump inválido ou chave incorreta.")
    with subprocess.Popen(command + [str(directory / "storage.tar.gz.age")],
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as decrypt:
        found, manifest = {}, None
        with tarfile.open(fileobj=decrypt.stdout, mode="r|gz") as archive:
            for member in archive:
                if not member.isfile():
                    raise BackupError("Membro de arquivo inválido.")
                source = archive.extractfile(member)
                if member.name == "manifest.json":
                    if manifest is not None or member.size > 64 * 1024 * 1024:
                        raise BackupError("Inventário inválido.")
                    manifest = json.load(source)
                else:
                    if member.name in found or not member.name.startswith("objects/"):
                        raise BackupError("Objeto duplicado/inválido.")
                    digest, size = hashlib.sha256(), 0
                    while chunk := source.read(1024 * 1024):
                        digest.update(chunk)
                        size += len(chunk)
                    found[member.name] = (size, digest.hexdigest())
        # tar may stop at end-of-archive before age's authentication trailer.
        while decrypt.stdout.read(1024 * 1024):
            pass
        if decrypt.wait() != 0:
            raise BackupError("Criptografia inválida ou arquivo corrompido.")
    if manifest is None or len(manifest["objects"]) != complete["storageObjects"]:
        raise BackupError("Inventário ausente/incompleto.")
    expected = {item["member"]: (item["size"], item["sha256"]) for item in manifest["objects"]}
    if len(expected) != len(manifest["objects"]) or found != expected:
        raise BackupError("Conteúdo dos anexos divergente.")
    print("Integridade e descriptografia verificadas; nenhum banco foi alterado.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--identity", required=True, type=Path)
    args = parser.parse_args()
    try:
        verify(args.directory, args.identity)
        return 0
    except Exception:
        print("Verificação falhou. Confira chave, inventário e integridade dos arquivos.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
