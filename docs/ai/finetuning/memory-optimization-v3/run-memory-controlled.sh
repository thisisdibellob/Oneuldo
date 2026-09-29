#!/usr/bin/env bash
# Probe only. Preserve production models, GPU selection, firewall and Java.
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
work=/home/duream/.local/share/oneuldo/qlora-memory-v3
source=/home/duream/.local/share/oneuldo/qlora-smoke-v1
exec 9>/run/oneuldo-qlora-smoke.lock
flock -n 9 || { echo 'Another probe is running.'; exit 1; }
cd "$work"
sha256sum -c SHA256SUMS
[[ ! -e controller-result.json && ! -e attempt-05-chunked-v3 ]] || { echo 'Previous attempt exists; refusing overwrite.'; exit 1; }
systemctl is-active --quiet oneuldo-ai
systemctl is-active --quiet ollama
if [[ -n $(ss -Htn state established '( sport = :8081 )') ]]; then
  echo 'CLIENT_CONNECTION_PRESENT: services unchanged.'; exit 2
fi
gpu=GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1
for n in 1 2 3; do
  util=$(nvidia-smi -i "$gpu" --query-gpu=utilization.gpu --format=csv,noheader,nounits)
  (( util < 5 )) || { echo 'GPU_1_BUSY: services unchanged.'; exit 2; }
  sleep 1
done
child=''
restore() {
  code=$?
  trap - EXIT HUP INT TERM
  set +e
  if [[ -n "$child" ]] && kill -0 "$child" 2>/dev/null; then
    # GNU timeout forwards TERM to its command process group.
    kill -TERM "$child" 2>/dev/null
    wait "$child"
  fi
  systemctl start ollama
  systemctl start oneuldo-ai
  healthy=0
  for n in $(seq 1 45); do
    if curl --max-time 2 -fsS http://127.0.0.1:8081/healthz >/dev/null 2>&1; then healthy=1; break; fi
    sleep 1
  done
  if (( healthy )) && systemctl is-active --quiet ollama oneuldo-ai; then
    echo "RESTORED: Ollama and gateway healthy. Probe exit=$code" | tee restoration.txt
  else
    echo 'RESTORE_FAILED: inspect ollama and oneuldo-ai immediately.' | tee restoration.txt
    code=3
  fi
  chown duream:duream restoration.txt maintenance.log 2>/dev/null
  exit "$code"
}
trap restore EXIT
trap 'exit 130' HUP INT TERM
echo 'MAINTENANCE: GPU 1 only; chunked loss, revised training cases, at most four steps; maximum 20 minutes for probes.'
systemctl stop oneuldo-ai
systemctl stop ollama
install -o duream -g duream -m 600 /dev/null maintenance.log
set +e
timeout --signal=TERM --kill-after=30s 1200 \
  runuser -u duream -- "$source/venv/bin/python" -u "$work/run_probes.py" >maintenance.log 2>&1 &
child=$!
wait "$child"
code=$?
child=''
set -e
tail -n 20 maintenance.log
exit "$code"
