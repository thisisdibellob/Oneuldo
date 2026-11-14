"""Local safety and transport tests; never contacts the school host."""

import base64
import contextlib
import errno
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location("archive_test_records", Path(__file__).with_name("archive-test-records.py"))
archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(archive)


FAKE_SSH = r'''#!/usr/bin/env python3
import hashlib, io, json, os, sys, tarfile, time
with open(os.environ["FAKE_SSH_CALLS"], "a") as calls:
    calls.write(json.dumps(sys.argv[1:]) + "\n")
if "-O" in sys.argv:
    sys.exit(1 if os.environ.get("FAKE_SSH_MODE") == "no-master" else 0)
request = json.loads(sys.stdin.buffer.readline())
if os.environ.get("FAKE_SSH_MODE") == "timeout":
    time.sleep(5)
payload = sys.stdin.buffer.read()
if os.environ.get("FAKE_SSH_MODE") == "partial":
    manifest = request["manifest"]
    destination = request["config"]["remote_root"] + "/" + manifest["run_id"] + "/" + manifest["snapshot_id"]
    print(json.dumps({"ok": False, "error": "Incomplete destination retained; operator action is required before retry", "pending_remote_path": destination, "operator_action_required": True}))
    sys.exit(1)
if os.environ.get("FAKE_SSH_MODE") == "failure":
    print(json.dumps({"ok": False, "error": "External disk UUID does not match"}))
    sys.exit(1)
assert hashlib.sha256(payload).hexdigest() == request["package_sha256"]
with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as package:
    manifest = json.load(package.extractfile("manifest.json"))
    assert manifest == request["manifest"]
    for record in manifest["files"]:
        content = package.extractfile("records/" + record["path"]).read()
        assert len(content) == record["size"]
        assert hashlib.sha256(content).hexdigest() == record["sha256"]
destination = request["config"]["remote_root"] + "/" + manifest["run_id"] + "/" + manifest["snapshot_id"]
print(json.dumps({"ok": True, "remote_path": "wrong" if os.environ.get("FAKE_SSH_MODE") == "wrong-receipt" else destination, "snapshot_id": manifest["snapshot_id"], "verified_files": len(manifest["files"])}))
'''


class TemporaryArchiveCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.source = self.root / "test-run"
        self.source.mkdir()
        self.store = self.root / "archives"

    def tearDown(self):
        self.temporary.cleanup()

    def record(self, name, content="test result\n"):
        path = self.source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode())
        return path

    def package(self):
        return archive.create_package(self.source, "complete", "test-run", self.store)


class ArchiveTests(TemporaryArchiveCase):
    def test_formats_private_names_symlinks_and_benign_tokens(self):
        self.record("result.json", '{"token_budget": 256, "password_required": false}')
        self.record("nested/replay.jsonl", '{"tokens_used": 5}\n')
        self.record("environment-plan.json", '{"layout": "spacious"}')
        self.record("environment-context.json", '{"shelf_count": 5}')
        self.record("plot.png", b"\x89PNG\r\n")
        self.record("pairing-token.json", '{"value": "not-uploaded"}')
        self.record("credentials.json")
        self.record("report.private.md")
        self.record(".private/log.txt")
        self.record(".env.local")
        self.record(".ssh/session.log")
        self.record("id_rsa")
        self.record("db-dump.json", '{"rows": []}')
        self.record("database.json", '{"rows": []}')
        self.record("personal-settings.json", '{"theme": "dark"}')
        self.record("pairing-url.json", '{"url": "https://test.invalid/pair"}')
        self.record("weights.gguf", b"model")
        self.record("dump.sql", b"database dump")
        self.record("runner.py", b"print('source')")
        self.record("server.jar", b"jar")
        outside = self.root / "outside.txt"
        outside.write_text("never upload")
        (self.source / "outside.txt").symlink_to(outside)
        (self.source / "linked-directory").symlink_to(self.root, target_is_directory=True)
        package, manifest = self.package()
        self.assertEqual([item["path"] for item in manifest["files"]], ["environment-context.json", "environment-plan.json", "nested/replay.jsonl", "plot.png", "result.json"])
        reasons = {item["path"]: item["reason"] for item in manifest["excluded"]}
        self.assertEqual(reasons["outside.txt"], "symlink")
        self.assertEqual(reasons["linked-directory"], "symlink")
        self.assertEqual(reasons[".private"], "private-or-credential-name")
        for name in ("pairing-token.json", "credentials.json", "report.private.md", ".env.local", ".ssh", "id_rsa", "pairing-url.json", "personal-settings.json"):
            self.assertEqual(reasons[name], "private-or-credential-name")
        for name in ("db-dump.json", "database.json"):
            self.assertEqual(reasons[name], "database-dump-name")
        with tarfile.open(str(package), "r:gz") as stored:
            self.assertEqual(stored.getnames(), ["manifest.json", "records/environment-context.json", "records/environment-plan.json", "records/nested/replay.jsonl", "records/plot.png", "records/result.json"])
        self.assertEqual(outside.read_text(), "never upload")

    def test_actual_secrets_excluded_but_field_names_and_redactions_allowed(self):
        header = base64.urlsafe_b64encode(b'{"alg":"HS256"}').decode().rstrip("=")
        payload = base64.urlsafe_b64encode(b'{"sub":"someone"}').decode().rstrip("=")
        self.record("jwt.log", header + "." + payload + ".signature123")
        self.record("header.txt", "Authorization: Bearer actual-test-value-12345")
        self.record("password.json", '{"password": "actual-test-password"}')
        self.record("api-result.json", '{"api_key": "actual-test-api-value"}')
        self.record("browser-result.json", '{"pairing_url": "https://test.invalid/pair?token=actual-test-token"}')
        self.record("browser-result.log", 'login_token="actual-login-test-token"')
        self.record("safe.json", '{"api_key": "<redacted>", "password": null, "token_budget": 250}')
        self.record("notes.md", "password and api_key are field names; token_budget=256")
        package, manifest = self.package()
        self.assertEqual([item["path"] for item in manifest["files"]], ["notes.md", "safe.json"])
        self.assertTrue(all(item["reason"].startswith("secret-content:") for item in manifest["excluded"]))
        with tarfile.open(str(package), "r:gz") as stored:
            all_bytes = b"".join(stored.extractfile(member).read() for member in stored)
        self.assertNotIn(b"actual-test-password", all_bytes)
        self.assertNotIn(b"actual-test-api-value", all_bytes)

    def test_snapshot_retries_are_identical_and_have_file_hashes(self):
        content = b'{"success": true}\n'
        self.record("result.json", content)
        first_package, first_manifest = self.package()
        first_digest = archive.file_sha256(first_package)
        second_package, second_manifest = self.package()
        self.assertEqual(first_manifest, second_manifest)
        self.assertEqual(first_package, second_package)
        self.assertEqual(first_digest, archive.file_sha256(second_package))
        self.assertEqual(first_manifest["files"][0]["sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual((self.source / "result.json").read_bytes(), content)

    def test_changed_file_aborts_snapshot(self):
        self.record("result.json", '{"success": true}')
        real_stat = os.stat

        def changed_stat(path, *args, **kwargs):
            details = real_stat(path, *args, **kwargs)
            if path == "result.json" and "dir_fd" in kwargs:
                return SimpleNamespace(st_dev=details.st_dev, st_ino=details.st_ino, st_size=details.st_size + 1,
                                       st_mtime_ns=details.st_mtime_ns, st_ctime_ns=details.st_ctime_ns)
            return details

        with mock.patch.object(archive.os, "stat", side_effect=changed_stat):
            with self.assertRaisesRegex(archive.ArchiveError, "changed during snapshot"):
                self.package()
        self.assertEqual(list(self.store.rglob("*.tar.gz")), [])

    def test_unsafe_manifest_paths_and_content_id_rejected(self):
        self.record("result.json")
        unused, manifest = self.package()
        for unsafe in ("../escape.json", "/absolute.json", "a/../escape.json", "a\\escape.json", "a//result.json"):
            changed = json.loads(json.dumps(manifest))
            changed["files"][0]["path"] = unsafe
            with self.assertRaises(archive.ArchiveError):
                archive.validate_manifest(changed)
        changed = json.loads(json.dumps(manifest))
        changed["status"] = "interrupted"
        with self.assertRaisesRegex(archive.ArchiveError, "snapshot ID"):
            archive.validate_manifest(changed)

    def test_source_cannot_contain_archive_receipts(self):
        self.record("result.json")
        with self.assertRaisesRegex(archive.ArchiveError, "must not contain"):
            archive.create_package(self.source, "complete", "test-run", self.source / "archives")


class TransportTests(TemporaryArchiveCase):
    def setUp(self):
        super().setUp()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        executable = self.bin / "ssh"
        executable.write_text(FAKE_SSH)
        executable.chmod(0o755)
        self.socket_path = self.root / "ssh.sock"
        self.socket_path.touch()
        self.calls = self.root / "ssh_calls.jsonl"
        self.config = {"host": "test@school.invalid", "port": 22022, "control_socket": str(self.socket_path),
                       "mountpoint": "/mnt/external", "expected_device": "/dev/sda1", "expected_uuid": "test-uuid",
                       "remote_root": "/mnt/external/oneuldo/tests"}
        self.config_path = self.root / "config.json"
        self.config_path.write_text(json.dumps(self.config))
        self.environment = {"PATH": str(self.bin) + os.pathsep + os.environ["PATH"], "FAKE_SSH_CALLS": str(self.calls)}

    def run_cli(self, mode="success", dry_run=False, timeout=None):
        self.record("result.json", '{"success": true}')
        stdout, stderr = io.StringIO(), io.StringIO()
        arguments = [str(self.source), "--status", "complete", "--config", str(self.config_path)]
        if dry_run:
            arguments.append("--dry-run")
        if timeout is not None:
            arguments.extend(["--timeout", str(timeout)])
        # The test transport is a process, not an SSH master; avoid opening any socket.
        with mock.patch.object(archive, "ARCHIVE_STORE", self.store), mock.patch.object(archive.stat, "S_ISSOCK", return_value=True), mock.patch.dict(os.environ, dict(self.environment, FAKE_SSH_MODE=mode)), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = archive.main(arguments)
        receipts = list(self.store.rglob("*.receipt.json"))
        self.assertEqual(len(receipts), 1)
        return result, json.loads(receipts[0].read_text()), stdout.getvalue(), stderr.getvalue()

    def test_fake_ssh_success_verifies_payload_and_reuses_only_master(self):
        result, receipt, stdout, stderr = self.run_cli()
        self.assertEqual(result, 0, stderr)
        self.assertEqual(receipt["state"], "archived")
        self.assertEqual(receipt["verified_files"], 1)
        self.assertTrue(Path(receipt["package_path"]).is_file())
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertEqual(len(calls), 2)
        for call in calls:
            self.assertIn("ControlMaster=no", call)
            self.assertIn("ProxyCommand=false", call)
            self.assertIn("BatchMode=yes", call)
            self.assertIn(str(self.socket_path), call)
        self.assertIn("remote_path", stdout)
        self.assertTrue((self.source / "result.json").exists())

    def test_failure_retains_package_and_pending_receipt(self):
        result, receipt, stdout, stderr = self.run_cli("failure")
        self.assertEqual(result, 1)
        self.assertEqual(receipt["state"], "pending")
        self.assertNotIn("remote_path", receipt)
        self.assertTrue(Path(receipt["package_path"]).is_file())
        self.assertIn("UUID", receipt["error"])
        self.assertEqual(stdout, "")
        self.assertIn("Local package retained", stderr)

    def test_wrong_remote_receipt_cannot_claim_completion(self):
        result, receipt, stdout, unused = self.run_cli("wrong-receipt")
        self.assertEqual(result, 1)
        self.assertEqual(receipt["state"], "pending")
        self.assertEqual(stdout, "")

    def test_unavailable_master_cannot_fallback_to_connection(self):
        result, receipt, unused, stderr = self.run_cli("no-master")
        self.assertEqual(result, 1)
        self.assertEqual(receipt["state"], "pending")
        self.assertEqual(len(self.calls.read_text().splitlines()), 1)
        self.assertIn("new connection is forbidden", stderr)

    def test_dry_run_performs_no_ssh_calls(self):
        result, receipt, stdout, stderr = self.run_cli(dry_run=True)
        self.assertEqual(result, 0, stderr)
        self.assertEqual(receipt["state"], "prepared")
        self.assertFalse(self.calls.exists())
        self.assertTrue(json.loads(stdout)["dry_run"])

    def test_upload_timeout_retains_pending_receipt(self):
        result, receipt, stdout, stderr = self.run_cli("timeout", timeout=1)
        self.assertEqual(result, 1)
        self.assertEqual(receipt["state"], "pending")
        self.assertIn("timeout", receipt["error"])
        self.assertTrue(Path(receipt["package_path"]).exists())

    def test_partial_remote_receipt_marks_required_operator_action(self):
        result, receipt, stdout, stderr = self.run_cli("partial")
        self.assertEqual(result, 1)
        self.assertEqual(receipt["state"], "pending")
        self.assertTrue(receipt["operator_action_required"])
        self.assertTrue(receipt["pending_remote_path"].endswith(receipt["snapshot_id"]))
        self.assertNotIn("remote_path", receipt)
        self.assertEqual(stdout, "")
        self.assertTrue(Path(receipt["package_path"]).exists())


class RemoteSafetyTests(TemporaryArchiveCase):
    def setUp(self):
        super().setUp()
        self.mount = self.root / "external"
        self.mount.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        findmnt = self.bin / "findmnt"
        findmnt.write_text('#!/usr/bin/env python3\nimport json,os,sys\nprobe=sys.argv[sys.argv.index("--target")+1]\nmount=os.environ["TEST_MOUNT"]\ntarget=os.environ.get("TEST_NESTED_TARGET", mount) if probe != mount else mount\nprint(json.dumps({"filesystems":[{"source":"/dev/sda1","target":target}]}))\n')
        findmnt.chmod(0o755)
        lsblk = self.bin / "lsblk"
        lsblk.write_text('#!/usr/bin/env python3\nimport os\nprint(os.environ.get("TEST_UUID", "test-uuid"))\n')
        lsblk.chmod(0o755)
        self.config = {"mountpoint": str(self.mount), "expected_device": "/dev/sda1", "expected_uuid": "test-uuid", "remote_root": str(self.mount / "tests")}

    def invoke_remote(self, payload, manifest, extra_environment=None, native_errno=None, hooks=""):
        request = {"config": self.config, "manifest": manifest, "package_size": len(payload), "package_sha256": hashlib.sha256(payload).hexdigest()}
        environment = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ["PATH"], TEST_MOUNT=str(self.mount))
        environment.update(extra_environment or {})
        program = archive.REMOTE_PROGRAM
        if not Path("/proc/self/fd").is_dir():
            # macOS lacks Linux procfs; preserve FD-based mkdir/extraction while
            # resolving fixture paths for readback and cleanup in these local tests.
            program = program.replace('Path("/proc/self/fd/" + str(run_fd))', 'Path(remote) / manifest["run_id"]')
            program = program.replace('Path("/proc/self/fd/" + str(staging_fd))', 'run_root / staging_name')
        if native_errno is not None:
            hooks = '''
class UnsupportedRename:
    def __call__(self, *args):
        ctypes.set_errno(NATIVE_ERRNO)
        return -1
class FakeLibc:
    renameat2 = UnsupportedRename()
ctypes.CDLL = lambda *args, **kwargs: FakeLibc()
'''.replace("NATIVE_ERRNO", str(native_errno)) + hooks
        if hooks:
            program = program.replace('try:\n    header = sys.stdin.buffer.readline', hooks + '\ntry:\n    header = sys.stdin.buffer.readline')
        result = subprocess.run([sys.executable, "-c", program], input=archive.canonical_json(request) + payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment, timeout=20)
        return result, json.loads(result.stdout)

    def altered_tar(self, package, extra_name=None, alter_manifest=False, alter_record=False, symlink=False):
        output = io.BytesIO()
        with tarfile.open(str(package), "r:gz") as original, tarfile.open(fileobj=output, mode="w:gz") as changed:
            for member in original:
                data = original.extractfile(member).read()
                if alter_manifest and member.name == "manifest.json":
                    data = b" " + data[1:]
                if alter_record and member.name.startswith("records/"):
                    data = b"X" * len(data)
                changed.addfile(member, io.BytesIO(data))
            if extra_name is not None:
                member = tarfile.TarInfo(extra_name)
                if symlink:
                    member.type = tarfile.SYMTYPE
                    member.linkname = "../../../outside"
                    changed.addfile(member)
                else:
                    member.size = 4
                    changed.addfile(member, io.BytesIO(b"evil"))
        return output.getvalue()

    def test_remote_rejects_traversal_links_and_extra_files(self):
        self.record("result.json")
        package, manifest = self.package()
        for name, link in (("../outside", False), ("/absolute", False), ("records/linked", True), ("records/extra.json", False)):
            result, reply = self.invoke_remote(self.altered_tar(package, name, symlink=link), manifest)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(reply["ok"])
            self.assertFalse((self.mount / "tests/test-run" / manifest["snapshot_id"]).exists())
            self.assertEqual(list(self.mount.rglob(".staging-*")), [])
        self.assertFalse((self.root / "outside").exists())

    def test_remote_rejects_manifest_and_file_hash_mismatch(self):
        self.record("result.json")
        package, manifest = self.package()
        for keywords, message in (({"alter_manifest": True}, "manifest differs"), ({"alter_record": True}, "hash or size")):
            result, reply = self.invoke_remote(self.altered_tar(package, **keywords), manifest)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(message, reply["error"])
            self.assertEqual(list(self.mount.rglob(".staging-*")), [])

    def test_wrong_uuid_blocks_all_remote_mutations(self):
        self.record("result.json")
        package, manifest = self.package()
        result, reply = self.invoke_remote(package.read_bytes(), manifest, {"TEST_UUID": "wrong-disk"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("UUID", reply["error"])
        self.assertEqual(list(self.mount.iterdir()), [])

    def test_nested_mount_blocks_all_remote_mutations(self):
        self.record("result.json")
        nested = self.mount / "tests"
        nested.mkdir()
        package, manifest = self.package()
        result, reply = self.invoke_remote(package.read_bytes(), manifest, {"TEST_NESTED_TARGET": str(nested)})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("different mount", reply["error"])
        self.assertEqual(list(nested.iterdir()), [])

    def test_destination_symlink_cannot_redirect_remote_writes(self):
        self.record("result.json")
        outside = self.root / "outside-directory"
        outside.mkdir()
        (self.mount / "tests").symlink_to(outside, target_is_directory=True)
        package, manifest = self.package()
        result, reply = self.invoke_remote(package.read_bytes(), manifest)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(reply["ok"])
        self.assertEqual(list(outside.iterdir()), [])

    def test_unsupported_rename_fallback_verifies_files_and_reuses_exact_archive(self):
        self.record("nested/result.json", '{"success":true}')
        package, manifest = self.package()
        for number in (errno.EINVAL, errno.ENOSYS, errno.EOPNOTSUPP):
            self.config["remote_root"] = str(self.mount / ("tests-" + str(number)))
            result, reply = self.invoke_remote(package.read_bytes(), manifest, native_errno=number)
            self.assertEqual(result.returncode, 0, reply)
            self.assertEqual(reply["commit_method"], "exclusive-copy-manifest-last")
            self.assertIn("errno=" + str(number), reply["renameat2_error"])
            destination = Path(reply["remote_path"])
            self.assertEqual((destination / "manifest.json").read_bytes(), archive.canonical_json(manifest))
            before = (destination / "manifest.json").stat().st_mtime_ns
            result, repeated = self.invoke_remote(package.read_bytes(), manifest, native_errno=number)
            self.assertEqual(result.returncode, 0, repeated)
            self.assertTrue(repeated["reused"])
            self.assertEqual(repeated["commit_method"], "existing-verified")
            self.assertEqual((destination / "manifest.json").stat().st_mtime_ns, before)
            self.assertEqual(list(self.mount.rglob(".staging-*")), [])

    def test_other_rename_errors_do_not_attempt_fallback(self):
        self.record("result.json")
        package, manifest = self.package()
        for number, name in ((13, "EACCES"), (18, "EXDEV")):
            result, reply = self.invoke_remote(package.read_bytes(), manifest, native_errno=number)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("errno=" + str(number) + " " + name, reply["error"])
            self.assertFalse((Path(self.config["remote_root"]) / manifest["run_id"] / manifest["snapshot_id"]).exists())

    def test_existing_empty_different_and_link_destinations_are_preserved(self):
        self.record("result.json")
        package, manifest = self.package()
        for mode in ("empty", "different", "link"):
            self.config["remote_root"] = str(self.mount / ("tests-" + mode))
            destination = Path(self.config["remote_root"]) / manifest["run_id"] / manifest["snapshot_id"]
            destination.parent.mkdir(parents=True)
            if mode == "link":
                outside = self.root / "protected"
                outside.mkdir()
                (outside / "keep.txt").write_text("unchanged")
                destination.symlink_to(outside, target_is_directory=True)
            else:
                destination.mkdir()
                if mode == "different":
                    (destination / "keep.txt").write_text("unchanged")
            original_inode = destination.lstat().st_ino
            result, reply = self.invoke_remote(package.read_bytes(), manifest, native_errno=22)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(reply["ok"])
            self.assertEqual(destination.lstat().st_ino, original_inode)
            if mode != "empty":
                self.assertEqual((destination / "keep.txt").read_text(), "unchanged")
            else:
                self.assertEqual(list(destination.iterdir()), [])

    def test_empty_destination_replacement_race_never_overwrites_foreign_directory(self):
        self.record("result.json")
        package, manifest = self.package()
        destination = Path(self.config["remote_root"]) / manifest["run_id"] / manifest["snapshot_id"]
        hooks = '''
original_copy = copy_reserved_record
def copy_reserved_record(staging_fd, reservation_fd, record, device):
    foreign = Path(os.environ["TEST_DESTINATION"])
    os.rename(str(foreign), str(foreign) + ".moved-own")
    foreign.mkdir()
    return original_copy(staging_fd, reservation_fd, record, device)
'''
        result, reply = self.invoke_remote(package.read_bytes(), manifest, {"TEST_DESTINATION": str(destination)}, native_errno=22, hooks=hooks)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("reservation was replaced", reply["error"])
        self.assertEqual(list(destination.iterdir()), [])
        self.assertFalse((Path(str(destination) + ".moved-own") / "manifest.json").exists())
        self.assertEqual(reply["pending_remote_path"], str(destination))

    def test_foreign_file_collision_is_retained_and_manifest_never_completed(self):
        self.record("result.json")
        package, manifest = self.package()
        destination = Path(self.config["remote_root"]) / manifest["run_id"] / manifest["snapshot_id"]
        hooks = '''
original_copy = copy_reserved_record
def copy_reserved_record(staging_fd, reservation_fd, record, device):
    target = Path(os.environ["TEST_DESTINATION"]) / "records" / record["path"]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"foreign content")
    return original_copy(staging_fd, reservation_fd, record, device)
'''
        result, reply = self.invoke_remote(package.read_bytes(), manifest, {"TEST_DESTINATION": str(destination)}, native_errno=22, hooks=hooks)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("EEXIST", reply["error"])
        self.assertEqual((destination / "records/result.json").read_bytes(), b"foreign content")
        self.assertFalse((destination / "manifest.json").exists())

    def test_mount_disappearance_retains_explicit_incomplete_destination(self):
        self.record("result.json")
        package, manifest = self.package()
        destination = Path(self.config["remote_root"]) / manifest["run_id"] / manifest["snapshot_id"]
        hooks = '''
original_mount = check_mount
mount_checks = 0
def check_mount(config):
    global mount_checks
    mount_checks += 1
    if mount_checks == 4:
        fail("External mount disappeared in test")
    return original_mount(config)
'''
        result, reply = self.invoke_remote(package.read_bytes(), manifest, native_errno=22, hooks=hooks)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mount disappeared", reply["error"])
        self.assertIn("operator action is required", reply["error"])
        self.assertEqual(reply["pending_remote_path"], str(destination))
        self.assertTrue((destination / "records/result.json").exists())
        self.assertFalse((destination / "manifest.json").exists())

    def test_corrupt_reserved_copy_fails_hash_check_before_manifest(self):
        self.record("result.json")
        package, manifest = self.package()
        destination = Path(self.config["remote_root"]) / manifest["run_id"] / manifest["snapshot_id"]
        hooks = '''
original_copy = copy_reserved_record
def copy_reserved_record(staging_fd, reservation_fd, record, device):
    original_copy(staging_fd, reservation_fd, record, device)
    target = Path(os.environ["TEST_DESTINATION"]) / "records" / record["path"]
    target.write_bytes(b"corrupted during reserved copy")
'''
        result, reply = self.invoke_remote(package.read_bytes(), manifest, {"TEST_DESTINATION": str(destination)}, native_errno=22, hooks=hooks)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("hash or size does not match", reply["error"])
        self.assertFalse((destination / "manifest.json").exists())
        self.assertEqual((self.source / "result.json").read_text(), "test result\n")

    def test_partial_retry_fails_explicitly_without_changing_existing_bytes(self):
        self.record("result.json")
        package, manifest = self.package()
        destination = Path(self.config["remote_root"]) / manifest["run_id"] / manifest["snapshot_id"]
        destination.mkdir(parents=True)
        (destination / "records").mkdir()
        (destination / "records/result.json").write_bytes(b"partial previous copy")
        result, reply = self.invoke_remote(package.read_bytes(), manifest, native_errno=22)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("operator action is required before retry", reply["error"])
        self.assertEqual((destination / "records/result.json").read_bytes(), b"partial previous copy")
        self.assertFalse((destination / "manifest.json").exists())

    def test_staging_name_replacement_is_never_recursively_deleted(self):
        self.record("result.json")
        package, manifest = self.package()
        run_root = Path(self.config["remote_root"]) / manifest["run_id"]
        hooks = '''
original_verify = verify_contents
stage_swapped = False
def verify_contents(destination, manifest, require_manifest=True):
    global stage_swapped
    original_verify(destination, manifest, require_manifest=require_manifest)
    if not stage_swapped:
        stage_swapped = True
        root = Path(os.environ["TEST_RUN_ROOT"])
        stage = next(path for path in root.iterdir() if path.name.startswith(".staging-"))
        os.rename(str(stage), str(stage) + ".moved-own")
        stage.mkdir()
        (stage / "foreign.txt").write_text("preserve foreign staging replacement")
'''
        result, reply = self.invoke_remote(package.read_bytes(), manifest, {"TEST_RUN_ROOT": str(run_root)}, native_errno=22, hooks=hooks)
        self.assertEqual(result.returncode, 0, reply)
        foreign = next(path for path in run_root.iterdir() if path.name.startswith(".staging-") and not path.name.endswith(".moved-own"))
        self.assertEqual((foreign / "foreign.txt").read_text(), "preserve foreign staging replacement")
        self.assertEqual((Path(reply["remote_path"]) / "manifest.json").read_bytes(), archive.canonical_json(manifest))

    def test_native_commit_preserves_final_and_foreign_vacated_stage_name(self):
        self.record("result.json")
        package, manifest = self.package()
        run_root = Path(self.config["remote_root"]) / manifest["run_id"]
        hooks = '''
class WorkingRename:
    def __call__(self, source_fd, source, destination_fd, destination, flags):
        source, destination = os.fsdecode(source), os.fsdecode(destination)
        os.rename(source, destination, src_dir_fd=source_fd, dst_dir_fd=destination_fd)
        os.mkdir(source, dir_fd=source_fd)
        descriptor = os.open("foreign.txt", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=os.open(source, os.O_RDONLY | os.O_DIRECTORY, dir_fd=source_fd))
        with os.fdopen(descriptor, "wb") as outgoing:
            outgoing.write(b"preserve foreign vacated staging name")
        return 0
class WorkingLibc:
    renameat2 = WorkingRename()
ctypes.CDLL = lambda *args, **kwargs: WorkingLibc()
'''
        result, reply = self.invoke_remote(package.read_bytes(), manifest, hooks=hooks)
        self.assertEqual(result.returncode, 0, reply)
        self.assertEqual(reply["commit_method"], "renameat2-noreplace")
        foreign = next(path for path in run_root.iterdir() if path.name.startswith(".staging-"))
        self.assertEqual((foreign / "foreign.txt").read_bytes(), b"preserve foreign vacated staging name")
        self.assertEqual((Path(reply["remote_path"]) / "manifest.json").read_bytes(), archive.canonical_json(manifest))


if __name__ == "__main__":
    unittest.main(verbosity=2)
