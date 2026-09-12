#!/usr/bin/env python3
"""Validate a team key and configure this checkout without printing the key."""
import getpass
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.error
import urllib.request

BASE_URL = "https://bluem.myvnc.com"
BACKEND = Path(__file__).resolve().parents[1]


def main():
    key = getpass.getpass("팀원용 AI API 키 (입력 내용은 표시되지 않습니다): ").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{64}", key):
        raise SystemExit("서버 add-key.sh로 발급한 64자리 키를 입력하세요. 파일은 변경하지 않았습니다.")
    request = urllib.request.Request(BASE_URL + "/api/tags", headers={"Authorization": "Bearer " + key})
    # Do not follow redirects carrying credentials to another destination.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
            models = json.load(response).get("models", [])
        if not any(m.get("name") == "qwen3.6:27b-q4_K_M" for m in models):
            raise SystemExit("예상한 모델을 확인하지 못했습니다. 파일은 변경하지 않았습니다.")
    except urllib.error.HTTPError as error:
        raise SystemExit(f"인증 확인 실패: HTTP {error.code}. 파일은 변경하지 않았습니다.") from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise SystemExit("HTTPS 연결 또는 응답 확인 실패. 파일은 변경하지 않았습니다.") from None

    target = BACKEND / "local.properties"
    original = target.read_text() if target.exists() else ""
    updates = {
        "ai.ollama.base-url": BASE_URL,
        "ai.ollama.api-key": key,
        "ai.ollama.timeout": "PT30M",
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
    print("실행: bash backend/scripts/run-home-ai.sh (프로젝트 루트에서)")


if __name__ == "__main__":
    main()
