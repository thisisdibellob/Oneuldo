#!/usr/bin/env bash
# Temporary, bounded maintenance for GPU 1. No firewall/model deployment changes.
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
work=/home/duream/.local/share/oneuldo/qlora-smoke-v1
exec 9>/run/oneuldo-qlora-smoke.lock
flock -n 9 || { echo 'Another smoke test is running.'; exit 1; }
[[ -f "$work/checkpoint-path.txt" && -f "$work/smoke_qlora.py" ]] || exit 1
[[ ! -f "$work/smoke-result.json" ]] || { echo 'A previous result exists; inspect it before retrying.'; exit 1; }
systemctl is-active --quiet oneuldo-ai
systemctl is-active --quiet ollama
# Conservative refusal while a client connection exists. The service also has
# a graceful SIGTERM shutdown; finish stopping the gateway before Ollama.
if [[ -n $(ss -Htn state established '( sport = :8081 )') ]]; then
  echo 'CLIENT_CONNECTION_PRESENT: deferred without stopping services.'; exit 2
fi
gpu=GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1
for n in 1 2 3; do
  util=$(nvidia-smi -i "$gpu" --query-gpu=utilization.gpu --format=csv,noheader,nounits)
  (( util < 5 )) || { echo 'GPU_1_BUSY: deferred.'; exit 2; }
  sleep 1
done
restore() {
  code=$?
  trap - EXIT HUP INT TERM
  systemctl start ollama
  systemctl start oneuldo-ai
  for n in $(seq 1 40); do
    if curl --max-time 2 -fsS http://127.0.0.1:8081/healthz > /dev/null 2>&1; then break; fi
    sleep 1
  done
  systemctl is-active ollama oneuldo-ai
  curl --max-time 5 -fsS http://127.0.0.1:8081/healthz
  printf '\nRESTORED: Ollama and gateway restarted. Probe exit=%s\n' "$code"
  exit "$code"
}
trap restore EXIT
trap 'exit 130' HUP INT TERM
echo 'MAINTENANCE: pausing gateway and Ollama; GPU 1 only, maximum 30 minutes.'
systemctl stop oneuldo-ai
systemctl stop ollama
# A separate process timeout bounds the probe even if SSH is disconnected.
set +e
timeout --signal=TERM --kill-after=30s 1800 \
  runuser -u duream -- "$work/venv/bin/python" -u "$work/smoke_qlora.py" --work "$work" \
  > "$work/smoke-console.log" 2>&1
code=$?
set -e
tail -n 30 "$work/smoke-console.log"
exit "$code"
