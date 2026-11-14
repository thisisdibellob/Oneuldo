#!/usr/bin/env python3
"""Snapshot non-secret test records and verify their archive on the school disk.

Uses only an already-established SSH control socket. Originals are never removed.
"""

import argparse
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import threading
import time


REPOSITORY = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = REPOSITORY / "scripts/test-records-archive.json"
ARCHIVE_STORE = REPOSITORY / "output/.test-archives"
RECORD_EXTENSIONS = frozenset(
    ".json .jsonl .log .txt .md .html .png .jpg .jpeg .svg .csv .tsv .pdf .pptx".split()
)
TEXT_EXTENSIONS = frozenset(".json .jsonl .log .txt .md .html .svg .csv .tsv".split())
PRIVATE_WORDS = frozenset(
    "private personal credential credentials env key keys secret secrets login auth authentication".split()
)
SECRET_ASSIGNMENT = re.compile(
    r"(?i)(?<![\w])(?:password|passwd|pwd|api[_-]?key|secret[_-]?key|"
    r"access[_-]?token|refresh[_-]?token|login[_-]?token|auth[_-]?token|session[_-]?token|"
    r"pairing[_-]?(?:url|link)|client[_-]?secret)[\"']?\s*[:=]\s*"
    r"(?:([\"'])(.*?)\1|([^\s,;}]+))"
)
BEARER = re.compile(r"(?i)\bBearer\s+([A-Za-z0-9._~+/=-]{8,})")
JWT = re.compile(
    r"(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{2,})\.([A-Za-z0-9_-]{2,})\."
    r"([A-Za-z0-9_-]{8,})(?![A-Za-z0-9_-])"
)
PLACEHOLDERS = frozenset(
    ("", "null", "none", "false", "redacted", "[redacted]", "<redacted>",
     "***", "****", "xxxxx", "your_api_key", "your-api-key", "${api_key}")
)


class ArchiveError(Exception):
    pass


def canonical_json(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def safe_relative_path(value):
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        return False
    return not value.startswith("/") and all(part not in ("", ".", "..") for part in value.split("/"))


def private_name_reason(name):
    lower = name.lower()
    words = set(filter(None, re.split(r"[._\-\s]+", lower)))
    if lower == ".ssh" or lower.startswith(".env") or words & PRIVATE_WORDS:
        return "private-or-credential-name"
    if lower.startswith(("id_rsa", "id_ed25519", "id_ecdsa", "id_dsa")):
        return "private-or-credential-name"
    if lower.endswith((".pem", ".key", ".p12", ".pfx", ".keystore")):
        return "private-or-credential-name"
    if lower in ("settings.json", "environment.json", "environment-config.json", "environment.config.json"):
        return "private-or-credential-name"
    if "pairing" in words and words & {"token", "tokens", "url", "link"}:
        return "private-or-credential-name"
    if lower in ("db.json", "database.json") or words & {"db", "database"} and words & {"dump", "backup", "snapshot"}:
        return "database-dump-name"
    return None


def placeholder(value):
    value = value.strip()
    return value.lower() in PLACEHOLDERS or bool(re.fullmatch(r"\*+|\$\{[^}]+\}|<[^>]+>", value))


def secret_content_reason(text):
    """Return only a reason, never the matched secret or its surrounding text."""
    for match in BEARER.finditer(text):
        if not placeholder(match.group(1)):
            return "secret-content:bearer"
    for match in JWT.finditer(text):
        try:
            decoded = []
            for segment in match.group(1, 2):
                decoded.append(json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))))
            if all(isinstance(value, dict) for value in decoded):
                return "secret-content:jwt"
        except (ValueError, UnicodeDecodeError):
            pass
    for match in SECRET_ASSIGNMENT.finditer(text):
        value = match.group(2) if match.group(1) else match.group(3)
        if value is not None and not placeholder(value):
            return "secret-content:credential-value"
    return None


def stat_signature(value):
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def _open_directory(name, parent_fd=None):
    flags = os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0)
    return os.open(name, flags, dir_fd=parent_fd)


def snapshot_records(source, snapshot_dir):
    """Read through directory FDs, refusing links and concurrent file changes."""
    files, excluded = [], []

    def visit(directory_fd, prefix=""):
        try:
            entries = sorted(os.scandir(directory_fd), key=lambda entry: entry.name)
        except OSError as error:
            raise ArchiveError("Cannot read source directory") from error
        for entry in entries:
            relative = prefix + entry.name
            if not safe_relative_path(relative):
                excluded.append({"path": relative, "reason": "unsafe-path"})
                continue
            try:
                original_stat = entry.stat(follow_symlinks=False)
            except OSError as error:
                raise ArchiveError("Source changed while scanning: " + relative) from error
            if stat.S_ISLNK(original_stat.st_mode):
                excluded.append({"path": relative, "reason": "symlink"})
                continue
            reason = private_name_reason(entry.name)
            if reason:
                excluded.append({"path": relative, "reason": reason})
                continue
            if stat.S_ISDIR(original_stat.st_mode):
                try:
                    child_fd = _open_directory(entry.name, directory_fd)
                except OSError as error:
                    raise ArchiveError("Source directory changed while scanning: " + relative) from error
                try:
                    if (os.fstat(child_fd).st_dev, os.fstat(child_fd).st_ino) != (original_stat.st_dev, original_stat.st_ino):
                        raise ArchiveError("Source directory changed while scanning: " + relative)
                    visit(child_fd, relative + "/")
                finally:
                    os.close(child_fd)
                continue
            if not stat.S_ISREG(original_stat.st_mode):
                excluded.append({"path": relative, "reason": "not-a-regular-file"})
                continue
            extension = Path(entry.name).suffix.lower()
            if extension not in RECORD_EXTENSIONS:
                excluded.append({"path": relative, "reason": "not-a-test-record-format"})
                continue
            destination = snapshot_dir / "records" / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            suspicious = None
            tail = ""
            try:
                file_fd = os.open(entry.name, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0), dir_fd=directory_fd)
                with os.fdopen(file_fd, "rb") as incoming, destination.open("wb") as outgoing:
                    if not stat.S_ISREG(os.fstat(incoming.fileno()).st_mode) or stat_signature(os.fstat(incoming.fileno())) != stat_signature(original_stat):
                        raise ArchiveError("Source file changed before snapshot: " + relative)
                    while True:
                        chunk = incoming.read(1024 * 1024)
                        if not chunk:
                            break
                        digest.update(chunk)
                        outgoing.write(chunk)
                        if extension in TEXT_EXTENSIONS and not suspicious:
                            text = tail + chunk.decode("utf-8", errors="replace")
                            suspicious = secret_content_reason(text)
                            tail = text[-16384:]
                    after_stat = os.stat(entry.name, dir_fd=directory_fd, follow_symlinks=False)
                    if stat_signature(os.fstat(incoming.fileno())) != stat_signature(original_stat) or stat_signature(after_stat) != stat_signature(original_stat):
                        raise ArchiveError("Source file changed during snapshot: " + relative)
            except OSError as error:
                raise ArchiveError("Cannot snapshot source file: " + relative) from error
            if suspicious:
                destination.unlink()
                excluded.append({"path": relative, "reason": suspicious})
            else:
                files.append({"path": relative, "size": original_stat.st_size, "sha256": digest.hexdigest()})

    source_fd = _open_directory(str(source))
    try:
        visit(source_fd)
    finally:
        os.close(source_fd)
    return sorted(files, key=lambda value: value["path"]), sorted(excluded, key=lambda value: value["path"])


def validate_manifest(manifest):
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise ArchiveError("Invalid manifest schema")
    if manifest.get("status") not in ("complete", "progress", "interrupted"):
        raise ArchiveError("Invalid manifest status")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", manifest.get("run_id", "")):
        raise ArchiveError("Invalid run ID")
    paths = set()
    for record in manifest.get("files", []):
        if not isinstance(record, dict) or set(record) != {"path", "size", "sha256"}:
            raise ArchiveError("Invalid manifest file record")
        if not safe_relative_path(record["path"]) or record["path"] in paths:
            raise ArchiveError("Unsafe or duplicate manifest path")
        if type(record["size"]) is not int or record["size"] < 0 or not re.fullmatch(r"[a-f0-9]{64}", record["sha256"]):
            raise ArchiveError("Invalid manifest file hash or size")
        paths.add(record["path"])
    basis = dict(manifest)
    snapshot_id = basis.pop("snapshot_id", None)
    if snapshot_id != hashlib.sha256(canonical_json(basis)).hexdigest():
        raise ArchiveError("Manifest snapshot ID does not match its contents")


def create_package(source, status, run_id, archive_store=None):
    source = Path(source)
    if source.is_symlink():
        raise ArchiveError("Source directory must not be a symlink")
    source = source.resolve(strict=True)
    archive_store = Path(ARCHIVE_STORE if archive_store is None else archive_store).resolve()
    if source == archive_store or source in archive_store.parents:
        raise ArchiveError("Source must not contain the local archive/receipt directory")
    archive_store.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".snapshot-", dir=str(archive_store)) as working:
        working_path = Path(working)
        files, excluded = snapshot_records(source, working_path)
        manifest = {"schema_version": 1, "run_id": run_id, "source_name": source.name,
                    "status": status, "files": files, "excluded": excluded}
        manifest["snapshot_id"] = hashlib.sha256(canonical_json(manifest)).hexdigest()
        validate_manifest(manifest)
        (working_path / "manifest.json").write_bytes(canonical_json(manifest))
        run_store = archive_store / run_id
        run_store.mkdir(exist_ok=True)
        package = run_store / (manifest["snapshot_id"] + ".tar.gz")
        descriptor, temporary = tempfile.mkstemp(prefix=".package-", dir=str(run_store))
        try:
            with os.fdopen(descriptor, "wb") as raw:
                with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as zipped:
                    with tarfile.open(fileobj=zipped, mode="w", format=tarfile.PAX_FORMAT) as archive:
                        names = ["manifest.json"] + ["records/" + record["path"] for record in files]
                        for name in names:
                            actual = working_path / name
                            member = tarfile.TarInfo(name)
                            member.size = actual.stat().st_size
                            member.mode = 0o600
                            member.mtime = 0
                            with actual.open("rb") as incoming:
                                archive.addfile(member, incoming)
                raw.flush()
                os.fsync(raw.fileno())
            if package.exists():
                if file_sha256(Path(temporary)) != file_sha256(package):
                    raise ArchiveError("Existing local package differs for this snapshot ID")
                os.unlink(temporary)
            else:
                os.replace(temporary, package)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return package, manifest


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as incoming:
        for chunk in iter(lambda: incoming.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


# Ubuntu 20.04 / Python 3.8 compatible; no extractall and no service/mount changes.
REMOTE_PROGRAM = r'''
import ctypes, errno, hashlib, json, os, re, shutil, stat, subprocess, sys, tarfile, uuid
from pathlib import Path

def fail(message):
    raise RuntimeError(message)

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")

def safe(value):
    return isinstance(value, str) and bool(value) and not value.startswith("/") and "\\" not in value and "\x00" not in value and all(part not in ("", ".", "..") for part in value.split("/"))

def hash_file(path):
    digest = hashlib.sha256()
    with open(str(path), "rb") as incoming:
        for chunk in iter(lambda: incoming.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def check_mount(config):
    found = subprocess.run(["findmnt", "--json", "--target", config["mountpoint"], "-o", "SOURCE,TARGET"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=15)
    mounted = json.loads(found.stdout)["filesystems"]
    if len(mounted) != 1 or mounted[0]["target"] != config["mountpoint"] or os.path.realpath(mounted[0]["source"]) != os.path.realpath(config["expected_device"]):
        fail("Mount source or target does not match the configured external disk")
    mount_device = Path(config["mountpoint"]).stat().st_dev
    found = subprocess.run(["lsblk", "-dnro", "UUID", config["expected_device"]], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=15)
    if found.stdout.decode().strip().lower() != config["expected_uuid"].lower():
        fail("External disk UUID does not match")
    root = Path(config["remote_root"])
    probe = root
    while not probe.exists():
        probe = probe.parent
    found = subprocess.run(["findmnt", "--json", "--target", str(probe), "-o", "SOURCE,TARGET"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=15)
    destination_mount = json.loads(found.stdout)["filesystems"]
    if len(destination_mount) != 1 or destination_mount[0]["target"] != config["mountpoint"] or os.path.realpath(destination_mount[0]["source"]) != os.path.realpath(config["expected_device"]):
        fail("Actual archive destination is on a different mount")
    if probe.stat().st_dev != mount_device or Path(config["mountpoint"]).stat().st_dev != mount_device:
        fail("Actual archive destination is on a different filesystem")
    if not os.access(str(probe), os.W_OK) or not os.access(config["mountpoint"], os.W_OK):
        fail("Archive destination is not writable")
    return mount_device

def child_directory(parent_fd, name, expected_device, create=True):
    if create:
        try:
            os.mkdir(name, 0o700, dir_fd=parent_fd)
        except FileExistsError:
            pass
    result = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
    if expected_device is not None and os.fstat(result).st_dev != expected_device:
        os.close(result)
        fail("Actual archive directory is on a different filesystem")
    return result

def pin_run_directory(config, run_id, expected_device):
    current = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        # Pin the verified mount before creating anything beneath it.
        for part in Path(config["mountpoint"]).parts[1:]:
            child = child_directory(current, part, None, create=False)
            os.close(current)
            current = child
        device = os.fstat(current).st_dev
        if device != expected_device or device != Path(config["mountpoint"]).stat().st_dev:
            fail("External mount changed while opening it")
        relative = config["remote_root"][len(config["mountpoint"].rstrip("/")) + 1:]
        for part in relative.split("/") + [run_id]:
            child = child_directory(current, part, device)
            os.close(current)
            current = child
        return current, device
    except Exception:
        os.close(current)
        raise

def record_parent(staging_fd, names, device, create=True):
    current = os.dup(staging_fd)
    try:
        for part in names:
            child = child_directory(current, part, device, create=create)
            os.close(current)
            current = child
        return current
    except Exception:
        os.close(current)
        raise

def verify_contents(destination, manifest, require_manifest=True):
    expected = {"records/" + item["path"] for item in manifest["files"]}
    if require_manifest:
        expected.add("manifest.json")
    actual = set()
    for root, dirs, files in os.walk(str(destination), followlinks=False):
        for name in dirs:
            if not stat.S_ISDIR(os.lstat(os.path.join(root, name)).st_mode):
                fail("Stored archive contains a directory link")
        for name in files:
            path = Path(root) / name
            if not stat.S_ISREG(os.lstat(str(path)).st_mode):
                fail("Stored archive contains a non-regular file")
            actual.add(str(path.relative_to(destination)))
    if actual != expected:
        fail("Stored archive file list differs from the manifest")
    if require_manifest and (destination / "manifest.json").read_bytes() != encoded(manifest):
        fail("Stored manifest differs from the local expected manifest")
    for item in manifest["files"]:
        path = destination / "records" / item["path"]
        if path.stat().st_size != item["size"] or hash_file(path) != item["sha256"]:
            fail("Stored record hash or size does not match")

def errno_detail(number):
    return "errno=" + str(number) + " " + errno.errorcode.get(number, "UNKNOWN")

def directory_identity(details):
    return (details.st_dev, details.st_ino)

def verify_existing(destination, manifest):
    if not stat.S_ISDIR(os.lstat(str(destination)).st_mode):
        fail("Existing archive destination is not a directory; it was preserved; operator action is required before retry")
    try:
        verify_contents(destination, manifest)
    except RuntimeError as error:
        fail(str(error) + "; existing destination was preserved; operator action is required before retry")

def check_reservation(run_fd, name, reservation_fd, identity, require_empty=False):
    try:
        actual = os.stat(name, dir_fd=run_fd, follow_symlinks=False)
    except FileNotFoundError:
        fail("Archive destination reservation disappeared")
    if not stat.S_ISDIR(actual.st_mode) or directory_identity(actual) != identity or directory_identity(os.fstat(reservation_fd)) != identity:
        fail("Archive destination reservation was replaced")
    if require_empty and os.listdir(reservation_fd):
        fail("Archive destination reservation is no longer empty")

def copy_reserved_record(staging_fd, reservation_fd, record, device):
    names = ("records/" + record["path"]).split("/")
    source_parent = record_parent(staging_fd, names[:-1], device, create=False)
    target_parent = None
    try:
        target_parent = record_parent(reservation_fd, names[:-1], device)
        digest, size = hashlib.sha256(), 0
        with os.fdopen(os.open(names[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=source_parent), "rb") as incoming:
            if not stat.S_ISREG(os.fstat(incoming.fileno()).st_mode):
                fail("Verified staging record is no longer a regular file")
            target = os.open(names[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=target_parent)
            with os.fdopen(target, "wb") as outgoing:
                for chunk in iter(lambda: incoming.read(1024 * 1024), b""):
                    digest.update(chunk)
                    size += len(chunk)
                    outgoing.write(chunk)
                outgoing.flush()
                os.fsync(outgoing.fileno())
        if size != record["size"] or digest.hexdigest() != record["sha256"]:
            fail("Reserved record copy hash or size does not match")
    finally:
        os.close(source_parent)
        if target_parent is not None:
            os.close(target_parent)

PENDING_DESTINATION = None

def clear_staging_directory(directory_fd, device):
    """Delete only through the pinned, newly-created staging directory."""
    try:
        with os.scandir(directory_fd) as entries:
            names = [entry.name for entry in entries]
        for name in names:
            original = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if stat.S_ISDIR(original.st_mode):
                child = child_directory(directory_fd, name, device, create=False)
                try:
                    if directory_identity(os.fstat(child)) != directory_identity(original):
                        continue
                    clear_staging_directory(child, device)
                    actual = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
                    if directory_identity(actual) == directory_identity(original):
                        os.rmdir(name, dir_fd=directory_fd)
                finally:
                    os.close(child)
            else:
                os.unlink(name, dir_fd=directory_fd)
    except OSError:
        # Preserve anything whose identity/ownership can no longer be verified.
        return

def cleanup_staging(run_fd, name, staging_fd, device, committed):
    if committed:
        return  # The staging FD is now the completed native archive.
    original = directory_identity(os.fstat(staging_fd))
    clear_staging_directory(staging_fd, device)
    try:
        actual = os.stat(name, dir_fd=run_fd, follow_symlinks=False)
        if stat.S_ISDIR(actual.st_mode) and directory_identity(actual) == original and not os.listdir(staging_fd):
            os.rmdir(name, dir_fd=run_fd)
    except OSError:
        pass

def commit_archive(run_fd, staging_name, staging_fd, destination, manifest, config, device):
    global PENDING_DESTINATION
    name = manifest["snapshot_id"]
    libc = ctypes.CDLL(None, use_errno=True)
    rename = getattr(libc, "renameat2", None)
    number = errno.ENOSYS
    if rename is not None:
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        result = rename(run_fd, os.fsencode(staging_name), run_fd, os.fsencode(name), 1)
        if result == 0:
            return False, "renameat2-noreplace", None
        number = ctypes.get_errno()
        if number == errno.EEXIST:
            verify_existing(destination, manifest)
            return True, "existing-verified", None
    unsupported = {errno.EINVAL, errno.ENOSYS, errno.EOPNOTSUPP, errno.ENOTSUP}
    if number not in unsupported:
        fail("Atomic archive commit failed (" + errno_detail(number) + ")")
    # NTFS/fuseblk may reject RENAME_NOREPLACE. Reserve the final name once,
    # pin that directory, and create every file exclusively. There is no
    # replacement/removal of any final directory. The exact manifest is the
    # last file written; only manifest + complete hash verification means done.
    try:
        os.mkdir(name, 0o700, dir_fd=run_fd)
    except FileExistsError:
        verify_existing(destination, manifest)
        return True, "existing-verified", errno_detail(number)
    PENDING_DESTINATION = config["remote_root"] + "/" + manifest["run_id"] + "/" + name
    reservation_fd = None
    try:
        reservation_fd = child_directory(run_fd, name, device, create=False)
        identity = directory_identity(os.fstat(reservation_fd))
        check_reservation(run_fd, name, reservation_fd, identity, require_empty=True)
        if check_mount(config) != device or os.fstat(run_fd).st_dev != device:
            fail("External mount changed before reserved archive commit")
        check_reservation(run_fd, name, reservation_fd, identity, require_empty=True)
        for record in manifest["files"]:
            check_reservation(run_fd, name, reservation_fd, identity)
            copy_reserved_record(staging_fd, reservation_fd, record, device)
        check_reservation(run_fd, name, reservation_fd, identity)
        verify_contents(destination, manifest, require_manifest=False)
        if check_mount(config) != device:
            fail("External mount changed before completing the reserved archive")
        check_reservation(run_fd, name, reservation_fd, identity)
        descriptor = os.open("manifest.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=reservation_fd)
        with os.fdopen(descriptor, "wb") as outgoing:
            outgoing.write(encoded(manifest))
            outgoing.flush()
            os.fsync(outgoing.fileno())
        check_reservation(run_fd, name, reservation_fd, identity)
        verify_contents(destination, manifest)
        PENDING_DESTINATION = None
        return False, "exclusive-copy-manifest-last", errno_detail(number)
    except Exception as error:
        detail = str(error) if isinstance(error, RuntimeError) else type(error).__name__ + (" (" + errno_detail(error.errno) + ")" if isinstance(error, OSError) and error.errno is not None else "")
        fail(detail + "; incomplete destination was retained; operator action is required before retry")
    finally:
        if reservation_fd is not None:
            os.close(reservation_fd)

def main(request):
    config, manifest = request["config"], request["manifest"]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", manifest["run_id"]) or not re.fullmatch(r"[a-f0-9]{64}", manifest["snapshot_id"]):
        fail("Unsafe archive identifier")
    expected = {}
    for item in manifest["files"]:
        if not safe(item["path"]) or item["path"] in expected or type(item["size"]) is not int or item["size"] < 0 or not re.fullmatch(r"[a-f0-9]{64}", item["sha256"]):
            fail("Unsafe manifest record")
        expected[item["path"]] = item
    basis = dict(manifest)
    basis.pop("snapshot_id")
    if hashlib.sha256(encoded(basis)).hexdigest() != manifest["snapshot_id"]:
        fail("Manifest snapshot ID does not match its contents")
    mount = config["mountpoint"].rstrip("/")
    remote = config["remote_root"]
    if not mount.startswith("/") or mount == "" or not remote.startswith(mount + "/") or not safe(remote[1:]):
        fail("Archive root must be beneath the external mount")
    mounted_device = check_mount(config)
    run_fd, device = pin_run_directory(config, manifest["run_id"], mounted_device)
    run_root = Path("/proc/self/fd/" + str(run_fd))
    destination = run_root / manifest["snapshot_id"]
    staging_name = ".staging-" + manifest["snapshot_id"] + "-" + uuid.uuid4().hex
    os.mkdir(staging_name, 0o700, dir_fd=run_fd)
    staging_fd = child_directory(run_fd, staging_name, device, create=False)
    staging = Path("/proc/self/fd/" + str(staging_fd))
    stage_committed = False
    try:
        upload = staging / ".upload.tar.gz"
        digest = hashlib.sha256()
        size = 0
        with upload.open("xb") as outgoing:
            for chunk in iter(lambda: sys.stdin.buffer.read(1024 * 1024), b""):
                size += len(chunk)
                if size > request["package_size"]:
                    fail("Uploaded package exceeds its expected size")
                digest.update(chunk)
                outgoing.write(chunk)
        if size != request["package_size"] or digest.hexdigest() != request["package_sha256"]:
            fail("Uploaded package size or SHA256 does not match")
        seen = set()
        with tarfile.open(str(upload), "r:gz") as archive:
            for member in archive:
                if not safe(member.name) or member.name in seen or not (member.isfile() or member.isdir()):
                    fail("Archive has an unsafe, duplicate, or linked entry")
                seen.add(member.name)
                if member.isdir():
                    if member.name != "records" and not any(("records/" + name).startswith(member.name + "/") for name in expected):
                        fail("Archive has an unexpected directory")
                    created = record_parent(staging_fd, member.name.split("/"), device)
                    os.close(created)
                    continue
                if member.name == "manifest.json":
                    if member.size != len(encoded(manifest)):
                        fail("Archive manifest size does not match")
                elif not member.name.startswith("records/") or member.name[8:] not in expected or member.size != expected[member.name[8:]]["size"]:
                    fail("Archive has an unexpected file or size")
                names = member.name.split("/")
                parent_fd = record_parent(staging_fd, names[:-1], device)
                try:
                    target_fd = os.open(names[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent_fd)
                    incoming = archive.extractfile(member)
                    with os.fdopen(target_fd, "wb") as outgoing:
                        shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
                    incoming.close()
                finally:
                    os.close(parent_fd)
        upload.unlink()
        verify_contents(staging, manifest)
        check_mount(config)
        if os.fstat(run_fd).st_dev != Path(config["mountpoint"]).stat().st_dev:
            fail("External mount changed before archive commit")
        reused, method, native_errno = commit_archive(run_fd, staging_name, staging_fd, destination, manifest, config, device)
        stage_committed = method == "renameat2-noreplace" and not reused
        verify_contents(destination, manifest)
        remote_path = remote + "/" + manifest["run_id"] + "/" + manifest["snapshot_id"]
        print(json.dumps({"ok": True, "remote_path": remote_path, "snapshot_id": manifest["snapshot_id"], "verified_files": len(manifest["files"]), "reused": reused, "commit_method": method, "renameat2_error": native_errno}))
    finally:
        cleanup_staging(run_fd, staging_name, staging_fd, device, stage_committed)
        os.close(staging_fd)
        os.close(run_fd)

try:
    header = sys.stdin.buffer.readline(64 * 1024 * 1024 + 1)
    if len(header) > 64 * 1024 * 1024 or not header.endswith(b"\n"):
        fail("Invalid upload request header")
    main(json.loads(header))
except Exception as error:
    message = str(error) if isinstance(error, RuntimeError) else "Remote archive verification or transfer failed (" + type(error).__name__ + (", " + errno_detail(error.errno) if isinstance(error, OSError) and error.errno is not None else "") + ")"
    print(json.dumps({"ok": False, "error": message, "pending_remote_path": PENDING_DESTINATION,
                      "operator_action_required": bool(PENDING_DESTINATION) or "operator action is required" in message}))
    sys.exit(1)
'''


def read_config(path):
    try:
        config = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ArchiveError("Cannot read archive configuration: " + str(path)) from error
    fields = {"host", "port", "control_socket", "mountpoint", "expected_device", "expected_uuid", "remote_root"}
    if not isinstance(config, dict) or set(config) != fields:
        raise ArchiveError("Archive configuration must contain exactly: " + ", ".join(sorted(fields)))
    if not isinstance(config["host"], str) or not re.fullmatch(r"[A-Za-z0-9_.@-]+", config["host"]):
        raise ArchiveError("Invalid configured SSH host")
    if type(config["port"]) is not int or not 1 <= config["port"] <= 65535:
        raise ArchiveError("Invalid configured SSH port")
    for key in ("mountpoint", "expected_device", "remote_root"):
        value = config[key]
        if not isinstance(value, str) or not value.startswith("/") or not safe_relative_path(value[1:]):
            raise ArchiveError("Invalid configured path: " + key)
    if not config["expected_device"].startswith("/dev/") or not re.fullmatch(r"[A-Za-z0-9-]+", config["expected_uuid"]):
        raise ArchiveError("Invalid configured external device or UUID")
    if not config["remote_root"].startswith(config["mountpoint"].rstrip("/") + "/"):
        raise ArchiveError("Remote archive root must be beneath the configured mountpoint")
    if not isinstance(config["control_socket"], str) or not config["control_socket"]:
        raise ArchiveError("Invalid configured SSH control socket")
    return config


def ssh_arguments(config):
    return ["ssh", "-F", "/dev/null", "-S", str(Path(config["control_socket"]).expanduser()),
            "-o", "ControlMaster=no", "-o", "ProxyCommand=false", "-o", "BatchMode=yes",
            "-o", "ConnectionAttempts=1", "-o", "ConnectTimeout=5", "-p", str(config["port"])]


def upload_package(config, package, manifest, timeout):
    socket_path = Path(config["control_socket"]).expanduser()
    try:
        if not stat.S_ISSOCK(socket_path.stat().st_mode):
            raise ArchiveError("The configured existing SSH control socket is not a socket")
    except OSError as error:
        raise ArchiveError("The configured existing SSH control socket is unavailable") from error
    command = ssh_arguments(config)
    checked = subprocess.run(command + ["-O", "check", config["host"]], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, timeout=15)
    if checked.returncode != 0:
        raise ArchiveError("The existing SSH master is unavailable; a new connection is forbidden")
    request = {"config": {key: config[key] for key in ("mountpoint", "expected_device", "expected_uuid", "remote_root")},
               "manifest": manifest, "package_size": package.stat().st_size, "package_sha256": file_sha256(package)}
    remote_command = shlex.join(["python3", "-c", REMOTE_PROGRAM])
    # Keep large manifests out of argv and stream the package without loading it in RAM.
    process = subprocess.Popen(command + [config["host"], remote_command], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    transport = process.stdin
    process.stdin = None  # communicate owns output; the writer owns and closes input.
    writer_errors = []

    def send():
        try:
            with transport, package.open("rb") as incoming:
                transport.write(canonical_json(request))
                shutil.copyfileobj(incoming, transport, 1024 * 1024)
        except (OSError, ValueError) as error:
            writer_errors.append(type(error).__name__)

    writer = threading.Thread(target=send, daemon=True)
    writer.start()
    try:
        stdout, unused_stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate(timeout=15)
        writer.join(timeout=5)
        raise ArchiveError("SSH upload exceeded the configured timeout")
    writer.join(timeout=5)
    if writer.is_alive():
        raise ArchiveError("SSH input stream did not finish")
    try:
        reply = json.loads(stdout.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as error:
        raise ArchiveError("SSH upload returned no valid verification receipt (exit " + str(process.returncode) + ")") from error
    if process.returncode != 0 or not isinstance(reply, dict) or reply.get("ok") is not True:
        error = ArchiveError("Remote upload failed: " + str(reply.get("error", "verification failed")) if isinstance(reply, dict) else "Remote upload failed")
        if isinstance(reply, dict) and reply.get("pending_remote_path") == config["remote_root"].rstrip("/") + "/" + manifest["run_id"] + "/" + manifest["snapshot_id"]:
            error.pending_remote_path = reply["pending_remote_path"]
        if isinstance(reply, dict) and reply.get("operator_action_required") is True:
            error.operator_action_required = True
        raise error
    if writer_errors:
        raise ArchiveError("SSH input stream failed (" + writer_errors[0] + ")")
    expected_path = config["remote_root"].rstrip("/") + "/" + manifest["run_id"] + "/" + manifest["snapshot_id"]
    if reply.get("remote_path") != expected_path or reply.get("snapshot_id") != manifest["snapshot_id"] or reply.get("verified_files") != len(manifest["files"]):
        raise ArchiveError("Remote verification receipt does not match the local snapshot")
    return reply


def write_receipt(path, value):
    descriptor, temporary = tempfile.mkstemp(prefix=".receipt-", dir=str(path.parent))
    try:
        with os.fdopen(descriptor, "wb") as outgoing:
            outgoing.write(canonical_json(value))
            outgoing.flush()
            os.fsync(outgoing.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="Test run directory, usually output/<run-directory>")
    parser.add_argument("--status", required=True, choices=("complete", "progress", "interrupted"))
    parser.add_argument("--run-id", help="Safe archive label; defaults to the source directory name")
    parser.add_argument("--dry-run", action="store_true", help="Prepare and inspect the local package without SSH or remote writes")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Archive destination configuration JSON")
    parser.add_argument("--timeout", type=int, default=300, help="SSH upload timeout in seconds (default: 300)")
    args = parser.parse_args(argv)
    package, receipt_path = None, None
    try:
        if args.timeout < 1:
            raise ArchiveError("Upload timeout must be positive")
        source_input = Path(args.source).expanduser()
        if source_input.is_symlink():
            raise ArchiveError("Source directory must not be a symlink")
        source = source_input.resolve(strict=True)
        if not source.is_dir():
            raise ArchiveError("Source must be a test run directory")
        run_id = args.run_id or re.sub(r"[^A-Za-z0-9._-]+", "-", source.name).strip(".-")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", run_id):
            raise ArchiveError("Run ID must be 1–128 safe letters, digits, dots, underscores or hyphens")
        config = read_config(args.config)
        package, manifest = create_package(source, args.status, run_id)
        receipt_path = package.with_suffix("").with_suffix(".receipt.json")
        receipt = {"schema_version": 1, "state": "prepared" if args.dry_run else "pending",
                   "run_id": run_id, "snapshot_id": manifest["snapshot_id"], "status": args.status,
                   "package_path": str(package), "package_sha256": file_sha256(package),
                   "file_count": len(manifest["files"]), "excluded_count": len(manifest["excluded"]),
                   "excluded": manifest["excluded"], "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        write_receipt(receipt_path, receipt)
        if args.dry_run:
            print(json.dumps({"state": "prepared", "dry_run": True, "files": receipt["file_count"],
                              "excluded": receipt["excluded_count"], "package": str(package), "receipt": str(receipt_path)}, ensure_ascii=False))
            return 0
        try:
            verified = upload_package(config, package, manifest, args.timeout)
        except (ArchiveError, OSError, subprocess.SubprocessError) as error:
            receipt["error"] = str(error) if isinstance(error, ArchiveError) else "Upload failed (" + type(error).__name__ + ")"
            if getattr(error, "pending_remote_path", None):
                receipt["pending_remote_path"] = error.pending_remote_path
                receipt["operator_action_required"] = True
            if getattr(error, "operator_action_required", False):
                receipt["operator_action_required"] = True
            write_receipt(receipt_path, receipt)
            raise ArchiveError(receipt["error"]) from error
        receipt.update({"state": "archived", "remote_path": verified["remote_path"],
                        "verified_files": verified["verified_files"], "reused": verified.get("reused", False),
                        "commit_method": verified.get("commit_method"), "renameat2_error": verified.get("renameat2_error")})
        write_receipt(receipt_path, receipt)
        print(json.dumps({"state": "archived", "remote_path": verified["remote_path"], "files": receipt["file_count"],
                          "excluded": receipt["excluded_count"], "receipt": str(receipt_path)}, ensure_ascii=False))
        return 0
    except (ArchiveError, OSError) as error:
        print("Archive failed: " + (str(error) if isinstance(error, ArchiveError) else type(error).__name__), file=sys.stderr)
        if package is not None:
            print("Local package retained: " + str(package), file=sys.stderr)
        if receipt_path is not None:
            print("Pending receipt: " + str(receipt_path), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
