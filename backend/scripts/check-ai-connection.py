#!/usr/bin/env python3
"""Bounded, read-only public connectivity checks. No API keys or inference."""
import argparse
from datetime import datetime, timezone
import json
import shutil
import subprocess
import time

SERVERS = {"school": "https://oneuldo.duckdns.org", "laptop": "https://bluem.myvnc.com"}


def classify(code, metrics, body, endpoint):
    if code == 6:
        return "DNS_FAILED"
    if code == 7:
        return "TCP_CONNECT_FAILED"
    if code in (35, 51, 58, 60, 77, 83, 90, 91):
        return "TLS_FAILED"
    if code == 28:
        if float(metrics.get("time_connect", 0)) == 0:
            return "TCP_CONNECT_TIMEOUT" if float(metrics.get("time_namelookup", 0)) > 0 else "DNS_OR_TCP_TIMEOUT"
        if float(metrics.get("time_appconnect", 0)) == 0:
            return "TLS_TIMEOUT"
        return "HTTP_RESPONSE_TIMEOUT"
    if code:
        return "TRANSPORT_FAILED"
    status = int(metrics.get("http_code", 0))
    if endpoint == "/api/tags" and status == 401:
        return "AUTH_REQUIRED_EXPECTED"
    if endpoint == "/api/tags" and status == 200:
        return "UNEXPECTED_UNAUTHENTICATED_ACCESS"
    if endpoint == "/healthz" and status == 200:
        try:
            if json.loads(body).get("status") == "up":
                return "GATEWAY_UP"
        except (ValueError, AttributeError):
            pass
        return "UNEXPECTED_HEALTH_RESPONSE"
    return "HTTP_" + str(status)


def probe(base, endpoint, direct=False):
    fields = ("http_code", "remote_ip", "remote_port", "local_ip", "local_port", "time_namelookup", "time_connect", "time_appconnect", "time_total")
    template = "\nONEULDO_METRICS\n" + "\n".join(n + "=%{" + n + "}" for n in fields)
    started_at = datetime.now(timezone.utc).isoformat()
    started = time.monotonic()
    try:
        # -q first disables personal curl configuration; no redirects or insecure TLS.
        command = ["curl", "-q"] + (["--noproxy", "*", "--ipv4"] if direct else [])
        result = subprocess.run(command + ["--silent", "--show-error", "--connect-timeout", "6",
                                 "--max-time", "12", "--max-filesize", "65536", "--write-out", template,
                                 base + endpoint], capture_output=True, text=True, timeout=15)
        body, marker, raw = result.stdout.rpartition("\nONEULDO_METRICS\n")
        metrics = dict(line.split("=", 1) for line in raw.splitlines() if "=" in line) if marker else {}
        return {"startedAt": started_at, "endedAt": datetime.now(timezone.utc).isoformat(),
                "endpoint": endpoint, "result": classify(result.returncode, metrics, body, endpoint),
                "curlExit": result.returncode, "metrics": metrics}
    except subprocess.TimeoutExpired:
        return {"startedAt": started_at, "endedAt": datetime.now(timezone.utc).isoformat(),
                "endpoint": endpoint, "result": "DIAGNOSTIC_TIMEOUT", "seconds": round(time.monotonic()-started, 2)}


def main():
    parser = argparse.ArgumentParser(description="AI 서버 공개 연결 진단. 키·설정 파일을 읽거나 변경하지 않습니다.")
    parser.add_argument("--server", choices=SERVERS, default="school")
    parser.add_argument("--attempts", type=int, choices=range(1, 11), default=2)
    parser.add_argument("--direct", action="store_true", help="프록시를 우회하고 IPv4로 직접 연결하여 경로를 대조합니다.")
    args = parser.parse_args()
    if not shutil.which("curl"):
        raise SystemExit("curl 명령이 필요합니다.")
    failed = False
    print(json.dumps({"server": SERVERS[args.server], "startedAt": datetime.now(timezone.utc).isoformat(),
                      "directIpv4": args.direct, "scope": "공개 HTTPS와 무인증 차단 검사. 개인 키 유효성·Ollama 추론은 검사하지 않습니다."}, ensure_ascii=False), flush=True)
    for attempt in range(1, args.attempts + 1):
        for endpoint in ("/healthz", "/api/tags"):
            result = probe(SERVERS[args.server], endpoint, args.direct)
            result["attempt"] = attempt
            failed |= result["result"] not in ("GATEWAY_UP", "AUTH_REQUIRED_EXPECTED")
            print(json.dumps(result, ensure_ascii=False), flush=True)
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
