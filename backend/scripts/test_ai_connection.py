import contextlib
import importlib.util
import io
from pathlib import Path
import socket
import ssl
import tempfile
import unittest
import urllib.error
from unittest.mock import patch


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


config = load("configure_home_ai", "configure-home-ai.py")
diagnostic = load("check_ai_connection", "check-ai-connection.py")


class ConnectionTest(unittest.TestCase):
    def test_auth_network_and_certificate_failures_have_distinct_guidance(self):
        cases = [
            (urllib.error.HTTPError("https://example.test", 401, "hidden", {}, None), "API 키 인증 실패"),
            (urllib.error.HTTPError("https://example.test", 502, "hidden", {}, None), "서버 서비스 오류"),
            (urllib.error.URLError(socket.gaierror(-2, "hidden")), "DNS 조회 실패"),
            (urllib.error.URLError(ssl.SSLCertVerificationError("hidden")), "TLS 인증서"),
            (urllib.error.URLError(TimeoutError("hidden")), "API 키 오류로 확인된 것이 아닙니다"),
            (urllib.error.URLError(ConnectionRefusedError("hidden")), "연결이 거절"),
        ]
        for error, expected in cases:
            with self.subTest(expected=expected):
                message = config.connection_error_message(error)
                self.assertIn(expected, message)
                self.assertNotIn("hidden", message)
                if isinstance(error, urllib.error.HTTPError):
                    error.close()

    def test_failed_key_setup_preserves_existing_file_and_does_not_print_key(self):
        secret = "a" * 64
        original = "ai.ollama.api-key=existing-key\nspring.datasource.password=private\n"
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "local.properties"
            target.write_text(original)
            output = io.StringIO()
            with patch.object(config, "BACKEND", Path(directory)), patch("sys.argv", ["configure-home-ai.py"]), \
                    patch.object(config.getpass, "getpass", return_value=secret), \
                    patch.object(config.urllib.request, "build_opener") as opener, contextlib.redirect_stdout(output):
                opener.return_value.open.side_effect = urllib.error.URLError(TimeoutError(secret))
                with self.assertRaises(SystemExit) as error:
                    config.main()
                self.assertIn("check-ai-connection.py", str(error.exception))
                self.assertNotIn(secret, str(error.exception) + output.getvalue())
                self.assertEqual(original, target.read_text())

    def test_school_and_laptop_setup_replace_stale_budgets_and_preserve_other_settings(self):
        for server, context, budget in [("school", "18432", "18000"), ("laptop", "8192", "7800")]:
            with self.subTest(server=server), tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / "local.properties"
                target.write_text("spring.datasource.password=private\nai.ollama.context-length=8192\nai.behavior-analysis.request-token-budget=7800\nai.behavior-analysis.chunk-output-tokens=400\n")
                secret = "b" * 64
                output = io.StringIO()
                with patch.object(config, "BACKEND", Path(directory)), patch("sys.argv", ["configure-home-ai.py", "--server", server]), \
                        patch.object(config.getpass, "getpass", return_value=secret), \
                        patch.object(config.urllib.request, "build_opener") as opener, contextlib.redirect_stdout(output):
                    opener.return_value.open.return_value = io.BytesIO(b'{"models":[{"name":"qwen3.6:27b-q4_K_M"}]}')
                    config.main()
                text = target.read_text()
                self.assertIn("spring.datasource.password=private", text)
                self.assertEqual(1, text.count("ai.ollama.context-length="))
                self.assertIn("ai.ollama.context-length=" + context, text)
                self.assertIn("ai.behavior-analysis.request-token-budget=" + budget, text)
                self.assertIn("ai.behavior-analysis.chunk-output-tokens=1800", text)
                self.assertIn("ai.behavior-analysis.quality-review=true", text)
                self.assertNotIn(secret, output.getvalue())
                self.assertEqual(0o600, target.stat().st_mode & 0o777)

    def test_direct_probe_records_request_times_and_disables_proxies_without_disabling_tls(self):
        from types import SimpleNamespace
        with patch.object(diagnostic.subprocess, "run", return_value=SimpleNamespace(returncode=28,
                stdout="\nONEULDO_METRICS\nhttp_code=000\ntime_namelookup=0.01\ntime_connect=0")) as run:
            result = diagnostic.probe("https://example.test", "/healthz", direct=True)
        self.assertLessEqual(result["startedAt"], result["endedAt"])
        self.assertEqual("TCP_CONNECT_TIMEOUT", result["result"])
        command = run.call_args.args[0]
        self.assertEqual(["curl", "-q", "--noproxy", "*", "--ipv4"], command[:5])
        self.assertNotIn("--insecure", command)

    def test_timeout_stage_and_expected_unauthorized_response(self):
        self.assertEqual("TCP_CONNECT_TIMEOUT", diagnostic.classify(28, {"time_namelookup": "0.1", "time_connect": "0"}, "", "/healthz"))
        self.assertEqual("TLS_TIMEOUT", diagnostic.classify(28, {"time_connect": "0.1"}, "", "/healthz"))
        self.assertEqual("HTTP_RESPONSE_TIMEOUT", diagnostic.classify(28, {"time_connect": "0.1", "time_appconnect": "0.2"}, "", "/healthz"))
        self.assertEqual("AUTH_REQUIRED_EXPECTED", diagnostic.classify(0, {"http_code": "401"}, "", "/api/tags"))
        self.assertEqual("UNEXPECTED_UNAUTHENTICATED_ACCESS", diagnostic.classify(0, {"http_code": "200"}, "{}", "/api/tags"))

    def test_health_requires_expected_body(self):
        self.assertEqual("UNEXPECTED_HEALTH_RESPONSE", diagnostic.classify(0, {"http_code": "200"}, "<html>proxy</html>", "/healthz"))
        self.assertEqual("GATEWAY_UP", diagnostic.classify(0, {"http_code": "200"}, '{"status":"up"}', "/healthz"))


if __name__ == "__main__":
    unittest.main()
