#!/usr/bin/env bash
set +x
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run: sudo bash enable-school-dns-tls.sh'; exit 1; }
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
sha256sum --check release.sha256
[[ -f /etc/oneuldo-caddy/Caddyfile && -x /opt/oneuldo-caddy/caddy ]] || {
    echo 'Install the school HTTPS service first'; exit 1;
}
./caddy list-modules | grep -qx 'dns.providers.duckdns'
printf '%s\n' 'Copy the token from your signed-in DuckDNS page.' \
    'Paste it only into this hidden prompt, not into chat or a command argument.'
read -r -s -p 'DuckDNS token (hidden): ' DUCKDNS_API_TOKEN < /dev/tty
printf '\n'
[[ $DUCKDNS_API_TOKEN =~ ^[A-Za-z0-9_-]{16,128}$ ]] || { echo 'Unexpected token format'; exit 1; }
export DUCKDNS_API_TOKEN
./caddy validate --config Caddyfile.school-dns --adapter caddyfile
backup_dir="/etc/oneuldo-caddy/before-dns-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 -o root -g root "$backup_dir"
cp -a /etc/oneuldo-caddy/Caddyfile "$backup_dir/Caddyfile"
cp -a /opt/oneuldo-caddy/caddy "$backup_dir/caddy"
dropin=/etc/systemd/system/oneuldo-https.service.d/50-duckdns.conf
[[ ! -f $dropin ]] || cp -a "$dropin" "$backup_dir/50-duckdns.conf"
[[ ! -f /etc/oneuldo-caddy/duckdns.env ]] || cp -a /etc/oneuldo-caddy/duckdns.env "$backup_dir/duckdns.env"
umask 077
printf 'DUCKDNS_API_TOKEN=%s\n' "$DUCKDNS_API_TOKEN" > /etc/oneuldo-caddy/duckdns.env
chown root:root /etc/oneuldo-caddy/duckdns.env
chmod 600 /etc/oneuldo-caddy/duckdns.env
unset DUCKDNS_API_TOKEN
install -d -m 755 -o root -g root /etc/systemd/system/oneuldo-https.service.d
printf '[Service]\nEnvironmentFile=/etc/oneuldo-caddy/duckdns.env\n' > "$dropin"
chmod 644 "$dropin"
install -m 755 -o root -g root caddy /opt/oneuldo-caddy/caddy.next
mv -f /opt/oneuldo-caddy/caddy.next /opt/oneuldo-caddy/caddy
install -m 644 -o root -g root Caddyfile.school-dns /etc/oneuldo-caddy/Caddyfile
systemctl daemon-reload
if ! systemctl restart oneuldo-https; then
    echo "Service restart failed. Saved previous files in $backup_dir"
    exit 1
fi
echo 'DNS certificate verification started. Waiting up to a few minutes...'
ready=false
for attempt in {1..60}; do
    if curl --connect-timeout 2 --max-time 3 --noproxy '*' \
        --resolve oneuldo.duckdns.org:443:127.0.0.1 -fsS \
        https://oneuldo.duckdns.org/healthz >/dev/null 2>&1; then
        ready=true; break
    fi
    sleep 3
done
if [[ $ready != true ]]; then
    echo 'Certificate is not ready yet. Showing logs with the DuckDNS token redacted:'
    python3 - <<'PY'
from pathlib import Path
import subprocess
token=Path('/etc/oneuldo-caddy/duckdns.env').read_text().strip().split('=',1)[1]
result=subprocess.run(['journalctl','-u','oneuldo-https','-n','35','--no-pager'],capture_output=True,text=True)
print(result.stdout.replace(token,'[REDACTED]'))
PY
    exit 1
fi
code=$(curl --max-time 10 --noproxy '*' --resolve oneuldo.duckdns.org:443:127.0.0.1 \
    -sS -o /dev/null -w '%{http_code}' https://oneuldo.duckdns.org/api/tags)
[[ $code == 401 ]] || { echo 'HTTPS authentication check failed'; exit 1; }
printf 'Authorization: Bearer %s\n' "$(cat /etc/oneuldo-ai/issued/admin-mac.key)" \
    | curl --max-time 10 --noproxy '*' --resolve oneuldo.duckdns.org:443:127.0.0.1 \
        -fsS -H @- https://oneuldo.duckdns.org/api/tags
printf '\nHTTPS_READY: https://oneuldo.duckdns.org\n'
printf '%s\n' 'DNS token saved privately for certificate renewal. No additional firewall ports were opened.'
