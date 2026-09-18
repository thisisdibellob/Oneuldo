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
