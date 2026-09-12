#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo'; exit 1; }
team=${1:-}
[[ $team =~ ^[a-z0-9-]{1,40}$ ]] || { echo 'Use a team name: lowercase letters, digits, hyphens (1-40 chars)'; exit 1; }
config=/etc/oneuldo-ai/keys.properties
[[ -f $config ]] || { echo 'Run install.sh first'; exit 1; }
exec 9>/etc/oneuldo-ai/key-management.lock
flock 9
if grep -q "^gateway.api-key-hashes\.${team}=" "$config" || [[ -e /etc/oneuldo-ai/issued/$team.key ]]; then
    echo 'Name already exists; choose another name or revoke the old key explicitly'; exit 1
fi
umask 077
key=$(openssl rand -hex 32)
digest=$(printf '%s' "$key" | sha256sum | cut -d ' ' -f 1)
printf '%s' "$key" > "/etc/oneuldo-ai/issued/$team.key"
printf 'gateway.api-key-hashes.%s=%s\n' "$team" "$digest" >> "$config"
printf 'Key saved privately to /etc/oneuldo-ai/issued/%s.key\n' "$team"
printf '%s\n' 'Restart oneuldo-ai after changes. Share only this member key, not keys.properties or the DDNS key.'
