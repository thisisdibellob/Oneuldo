#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run this script with sudo.'; exit 1; }
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
sha256sum --check oneuldo-ai-gateway.jar.sha256
jar=/opt/oneuldo-ai/oneuldo-ai-gateway.jar
backup="${jar}.before-schema-$(date +%Y%m%d-%H%M%S)"
cp -p -- "$jar" "$backup"
install -o root -g root -m 644 oneuldo-ai-gateway.jar "${jar}.new"
mv -f -- "${jar}.new" "$jar"
if systemctl restart oneuldo-ai; then
    for attempt in {1..30}; do
        if curl --max-time 2 -fsS http://127.0.0.1:8081/healthz >/dev/null; then
            printf 'Updated. Backup: %s\n' "$backup"
            exit 0
        fi
        sleep 1
    done
fi
install -o root -g root -m 644 "$backup" "${jar}.new"
mv -f -- "${jar}.new" "$jar"
systemctl restart oneuldo-ai
printf 'Update health check failed; restored %s\n' "$backup" >&2
exit 1
