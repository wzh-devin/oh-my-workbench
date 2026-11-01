#!/bin/bash
set -euo pipefail

mkdir -p "$HOME"
pids=()

# Any child failure stops the container; Docker owns restart and Tini reaps descendants.
stop() {
  trap - TERM INT
  if ((${#pids[@]})); then
    kill -TERM "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap 'stop; exit 0' TERM INT

/usr/local/bin/flowly-api &
pids+=("$!")

# Conversion processes do not need database or Redis deployment credentials.
preview_env=(env -u DATABASE_URL -u REDIS_ADDR -u REDIS_PASSWORD -u COOKIE_SECURE -u WORKER_ID)
nice -n 10 "${preview_env[@]}" /usr/bin/gotenberg \
  --api-bind-ip=127.0.0.1 \
  --api-timeout=60s \
  --api-body-limit=55MB \
  --api-disable-download-from=true \
  --webhook-disable=true \
  --chromium-disable-routes=true \
  --libreoffice-deny-list='.*' \
  --libreoffice-max-queue-size=4 &
pids+=("$!")

nice -n 10 "${preview_env[@]}" /usr/local/bin/asset-renderer --listen=127.0.0.1:13040 &
pids+=("$!")

/usr/sbin/nginx -c /etc/flowly/nginx.conf -g 'daemon off;' &
pids+=("$!")

status=0
wait -n "${pids[@]}" || status=$?
stop
((status != 0)) || status=1
exit "$status"
