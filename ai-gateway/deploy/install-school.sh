#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 && -n ${SUDO_USER:-} && $SUDO_USER != root ]] || {
    echo 'Run as the server administrator: sudo bash install-school.sh'; exit 1;
}
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
sha256sum --check oneuldo-ai-gateway.jar.sha256 java21.tar.gz.sha256 libtokenizers.so.sha256
if ldd libtokenizers.so 2>&1 | grep -q 'not found'; then
    echo 'Tokenizer native library is incompatible with this host'; exit 1
fi
default_java_before=$(readlink -f /usr/bin/java)
runtime=/opt/oneuldo-java21
if [[ ! -e $runtime ]]; then
    staging=$(mktemp -d /opt/oneuldo-java21.XXXXXX)
    trap 'if [[ -n ${staging:-} ]]; then rm -rf -- "$staging"; fi' EXIT
    tar xzf java21.tar.gz -C "$staging" --strip-components=1 --no-same-owner
    chown -R root:root "$staging"
    chmod -R go-w "$staging"
    chmod 755 "$staging"
    "$staging/bin/java" -version
    cp java21.tar.gz.sha256 "$staging/.oneuldo-runtime.sha256"
    mv -- "$staging" "$runtime"
    staging=''
else
    cmp -s java21.tar.gz.sha256 "$runtime/.oneuldo-runtime.sha256" || {
        echo 'A different Java runtime already exists; inspect it before changing it.'; exit 1;
    }
fi
ONEULDO_JAVA_BIN="$runtime/bin/java" bash install.sh
install -d -m 755 -o root -g root /opt/oneuldo-ai/native
install -m 644 -o root -g root libtokenizers.so /opt/oneuldo-ai/native/libtokenizers.so
printf '[Service]\nEnvironment="RUST_LIBRARY_PATH=/opt/oneuldo-ai/native/libtokenizers.so"\n' \
    > /etc/systemd/system/oneuldo-ai.service.d/20-tokenizer.conf
chmod 644 /etc/systemd/system/oneuldo-ai.service.d/20-tokenizer.conf
systemctl daemon-reload
if [[ ! -f /etc/oneuldo-ai/issued/admin-mac.key ]]; then
    /opt/oneuldo-ai/add-key.sh admin-mac
fi
systemctl restart ollama
systemctl restart oneuldo-ai
ready=false
for attempt in {1..30}; do
    if curl --max-time 2 -fsS http://127.0.0.1:8081/healthz > /dev/null 2>&1; then
        ready=true; break
    fi
    sleep 2
done
[[ $ready == true ]] || {
    journalctl -u oneuldo-ai -n 40 --no-pager; exit 1;
}
unauthenticated=$(curl --max-time 5 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/api/tags)
[[ $unauthenticated == 401 ]] || { echo 'Unauthenticated request was not rejected'; exit 1; }
printf 'Authorization: Bearer %s\n' "$(cat /etc/oneuldo-ai/issued/admin-mac.key)" \
    | curl --max-time 10 -fsS -H @- http://127.0.0.1:8081/api/tags
printf '\n'
printf 'Authorization: Bearer %s\n' "$(cat /etc/oneuldo-ai/issued/admin-mac.key)" \
    | curl --max-time 180 -fsS -H @- -H 'Content-Type: application/json' \
        http://127.0.0.1:8081/api/chat \
        -d '{"model":"qwen3.6:27b-q4_K_M","messages":[{"role":"user","content":"연결 성공이라고 짧게 답해줘."}],"think":false,"stream":false,"options":{"num_ctx":18432,"num_predict":64}}' \
    | python3 -c 'import json,sys; r=json.load(sys.stdin); assert r.get("done") and r.get("message",{}).get("content"), "Invalid AI response"; print("AI response:",r["message"]["content"])'
[[ $(readlink -f /usr/bin/java) == "$default_java_before" ]] || { echo 'Default Java changed unexpectedly'; exit 1; }
# The administrator needs their own client key locally; never print it or put it in the release.
administrator_home=$(getent passwd "$SUDO_USER" | cut -d: -f6)
administrator_group=$(id -gn "$SUDO_USER")
[[ -d $administrator_home ]] || exit 1
client_dir="$administrator_home/.local/share/oneuldo"
install -d -m 700 -o "$SUDO_USER" -g "$administrator_group" "$client_dir"
install -m 600 -o "$SUDO_USER" -g "$administrator_group" \
    /etc/oneuldo-ai/issued/admin-mac.key "$client_dir/school-gateway-client.key"
printf '%s\n' 'Gateway ready on 127.0.0.1:8081. Key authentication verified.' \
    'System Java, firewall rules, GPU selection files, and the laptop server were not changed.' \
    'The administrator client key is saved privately under ~/.local/share/oneuldo/.'
