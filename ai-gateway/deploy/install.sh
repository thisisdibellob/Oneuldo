#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run: sudo bash install.sh'; exit 1; }
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
[[ -f oneuldo-ai-gateway.jar ]] || { echo 'Release jar is missing'; exit 1; }
/usr/bin/java -version
java_major=$(/usr/bin/java -XshowSettings:properties -version 2>&1 | sed -n 's/.*java.specification.version = //p')
[[ $java_major =~ ^[0-9]+$ && $java_major -ge 21 ]] || { echo 'Java 21 or newer is required'; exit 1; }
id oneuldo-ai >/dev/null 2>&1 || useradd --system --home-dir /var/lib/oneuldo-ai --shell /usr/sbin/nologin oneuldo-ai
install -d -o root -g root -m 755 /opt/oneuldo-ai
install -d -o root -g oneuldo-ai -m 750 /etc/oneuldo-ai
install -d -o root -g root -m 700 /etc/oneuldo-ai/issued
install -m 644 oneuldo-ai-gateway.jar /opt/oneuldo-ai/oneuldo-ai-gateway.jar
install -m 644 oneuldo-ai.service /etc/systemd/system/oneuldo-ai.service
install -m 750 -o root -g root add-key.sh /opt/oneuldo-ai/add-key.sh
if [[ ! -f /etc/oneuldo-ai/keys.properties ]]; then
    install -m 640 -o root -g oneuldo-ai /dev/null /etc/oneuldo-ai/keys.properties
fi
install -d -m 755 /etc/systemd/system/ollama.service.d
install -m 644 70-oneuldo-gateway.conf /etc/systemd/system/ollama.service.d/70-oneuldo-gateway.conf
systemctl daemon-reload
systemctl enable oneuldo-ai.service
printf '%s\n' 'Installed. Create a key before starting; no ports or Caddy configuration were changed.'
printf '%s\n' 'sudo /opt/oneuldo-ai/add-key.sh member1'
printf '%s\n' 'sudo systemctl restart ollama'
printf '%s\n' 'sudo systemctl start oneuldo-ai'
