#!/usr/bin/env python3
"""Validate a team key and configure this checkout without printing the key."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import socket
import ssl
import tempfile
import urllib.error
import urllib.request

SERVERS = {
    "school": "https://oneuldo.duckdns.org",
    "laptop": "https://bluem.myvnc.com",
}
SERVER_BUDGETS = {"school": (18432, 18000), "laptop": (8192, 7800)}
SERVER_FINAL_OUTPUT = {"school": 2400, "laptop": 1800}
BACKEND = Path(__file__).resolve().parents[1]


def connection_error_message(error):
    """Classify without echoing URLs, response bodies or credentials."""
    if isinstance(error, urllib.error.HTTPError):
        if error.code in (401, 403):
            return f"API 키 인증 실패 (HTTP {error.code}). 선택한 서버에서 발급한 본인 키인지 확인하세요."
        if error.code == 429:
            return "서버 요청 제한 (HTTP 429). 진행 중인 요청이 끝난 후 다시 확인하세요."
        if error.code >= 500:
            return f"서버 서비스 오류 (HTTP {error.code}). 관리자에게 서비스 상태 확인을 요청하세요."
        return f"서버가 요청을 거부했습니다 (HTTP {error.code}). 서버 주소와 게이트웨이 구성을 확인하세요."
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    if isinstance(reason, socket.gaierror):
        return "DNS 조회 실패. 서버 이름을 IP 주소로 찾지 못했습니다. DNS와 네트워크를 확인하세요."
    if isinstance(reason, ssl.SSLError):
        return "TLS 인증서 또는 암호화 연결 확인 실패. 인증서 검증을 끄지 말고 서버 인증서와 PC 시간을 확인하세요."
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return "HTTPS 연결 또는 응답 시간 초과. API 키 오류로 확인된 것이 아닙니다. 네트워크와 서버 상태를 확인하세요."
    if isinstance(reason, ConnectionRefusedError):
        return "서버 연결이 거절되었습니다. HTTPS 서비스와 포트 설정을 확인하세요."
    return "HTTPS 연결 또는 응답 확인 실패. 연결 진단 명령으로 실패 단계를 확인하세요."


def main():
    parser = argparse.ArgumentParser(description="팀원 AI 서버 연결 설정 (기본: 학교 서버)")
    parser.add_argument("--server", choices=SERVERS, default="school")
    args = parser.parse_args()
    base_url = SERVERS[args.server]
    print(f"연결 대상: {base_url} — 해당 서버에서 발급한 키를 입력하세요.")
    key = getpass.getpass("팀원용 AI API 키 (입력 내용은 표시되지 않습니다): ").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{64}", key):
        raise SystemExit("서버 add-key.sh로 발급한 64자리 키를 입력하세요. 파일은 변경하지 않았습니다.")
    request = urllib.request.Request(base_url + "/api/tags", headers={"Authorization": "Bearer " + key})
    # Do not follow redirects carrying credentials to another destination.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
            models = json.load(response).get("models", [])
        if not any(m.get("name") == "qwen3.6:27b-q4_K_M" for m in models):
            raise SystemExit("예상한 모델을 확인하지 못했습니다. 파일은 변경하지 않았습니다.")
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
        raise SystemExit(connection_error_message(error) + "\n파일은 변경하지 않았습니다.\n"
                         f"진단: python3 backend/scripts/check-ai-connection.py --server {args.server}") from None

    target = BACKEND / "local.properties"
    original = target.read_text() if target.exists() else ""
    context, budget = SERVER_BUDGETS[args.server]
    final_output = SERVER_FINAL_OUTPUT[args.server]
    updates = {
        "ai.ollama.base-url": base_url,
        "ai.ollama.api-key": key,
        "ai.ollama.timeout": "PT30M",
        "ai.ollama.context-length": str(context),
        "ai.behavior-analysis.request-token-budget": str(budget),
        "ai.behavior-analysis.chunk-output-tokens": "1800",
        "ai.behavior-analysis.final-output-tokens": str(final_output),
        "ai.behavior-analysis.quality-review": "true",
    }
    lines = [line for line in original.splitlines()
             if not any(re.match(r"^\s*" + re.escape(name) + r"\s*[:=]", line) for name in updates)]
    lines.extend(f"{name}={value}" for name, value in updates.items())
    # Atomic replacement, owner-only permissions, and no extra plaintext backup.
    descriptor, temporary = tempfile.mkstemp(prefix=".ai-config-", dir=BACKEND)
    try:
        with os.fdopen(descriptor, "w") as output:
            output.write("\n".join(lines) + "\n")
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print("API 인증 성공. backend/local.properties에 저장했습니다 (키는 출력하지 않습니다).")
    print(f"분석 설정: context={context}, requestBudget={budget}, observationOutput=1800, finalOutput={final_output}, qualityReview=true")
    print("실행: bash backend/scripts/run-home-ai.sh (프로젝트 루트에서)")


if __name__ == "__main__":
    main()
