#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run: sudo bash install-school-https.sh'; exit 1; }
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export LC_ALL=C
sha256sum --check caddy.sha256 config.sha256
python3 - <<'PY'
import socket
addresses={entry[4][0] for entry in socket.getaddrinfo('oneuldo.duckdns.org',443,type=socket.SOCK_STREAM)}
assert addresses=={'117.16.44.110'}, 'DNS must point only to the school server: '+str(addresses)
print('School DNS verified.')
PY
ufw status | grep -q '^Status: active$' || { echo 'Expected active UFW; inspect before proceeding'; exit 1; }
systemctl is-active --quiet oneuldo-ai
curl --max-time 5 -fsS http://127.0.0.1:8081/healthz
printf '\n'
code=$(curl --max-time 5 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/api/tags)
[[ $code == 401 ]] || { echo 'Gateway must reject unauthenticated calls'; exit 1; }
if ! systemctl is-active --quiet oneuldo-https; then
    [[ -z $(ss -H -lnt 'sport = :443') ]] || { echo 'Port 443 is already occupied'; exit 1; }
fi
./caddy validate --config Caddyfile.school --adapter caddyfile
if id oneuldo-caddy >/dev/null 2>&1; then
    [[ $(getent passwd oneuldo-caddy | cut -d: -f6) == /var/lib/oneuldo-caddy ]] || {
        echo 'Unexpected existing oneuldo-caddy account'; exit 1;
    }
else
    useradd --system --user-group --home-dir /var/lib/oneuldo-caddy --shell /usr/sbin/nologin oneuldo-caddy
fi
for installed in /opt/oneuldo-caddy/caddy /etc/oneuldo-caddy/Caddyfile /etc/systemd/system/oneuldo-https.service; do
    if [[ -f $installed ]]; then cp -a "$installed" "$installed.before-$(date +%Y%m%d-%H%M%S)"; fi
done
install -d -m 755 -o root -g root /opt/oneuldo-caddy /etc/oneuldo-caddy
install -m 755 -o root -g root caddy /opt/oneuldo-caddy/caddy
install -m 644 -o root -g root Caddyfile.school /etc/oneuldo-caddy/Caddyfile
install -m 644 -o root -g root oneuldo-https.service /etc/systemd/system/oneuldo-https.service
systemd-analyze verify /etc/systemd/system/oneuldo-https.service
systemctl daemon-reload
ufw allow 443/tcp comment 'oneuldo-https'
systemctl enable oneuldo-https
systemctl restart oneuldo-https
echo 'Waiting for the public TLS certificate (up to a few minutes)...'
ready=false
for attempt in {1..40}; do
    if curl --connect-timeout 2 --max-time 4 --noproxy '*' \
        --resolve oneuldo.duckdns.org:443:127.0.0.1 -fsS \
        https://oneuldo.duckdns.org/healthz >/dev/null 2>&1; then
        ready=true; break
    fi
    sleep 2
done
[[ $ready == true ]] || {
    echo 'HTTPS is not ready yet. Service remains enabled; inspect certificate errors below.'
    journalctl -u oneuldo-https -n 45 --no-pager
    exit 1
}
code=$(curl --max-time 10 --noproxy '*' --resolve oneuldo.duckdns.org:443:127.0.0.1 \
    -sS -o /dev/null -w '%{http_code}' https://oneuldo.duckdns.org/api/tags)
[[ $code == 401 ]] || { echo 'HTTPS authentication check failed'; exit 1; }
printf 'Authorization: Bearer %s\n' "$(cat /etc/oneuldo-ai/issued/admin-mac.key)" \
    | curl --max-time 10 --noproxy '*' --resolve oneuldo.duckdns.org:443:127.0.0.1 \
        -fsS -H @- https://oneuldo.duckdns.org/api/tags
printf '\n'
systemctl is-active oneuldo-https oneuldo-ai ollama
printf '%s\n' 'HTTPS_READY: https://oneuldo.duckdns.org' \
    'Public TLS and gateway authentication verified locally. Verify externally from the Mac next.' \
    'Only TCP 443 was added to UFW. Existing SSH, GPU, Java and laptop settings were preserved.'
