#!/bin/sh
set -eu

curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8080/api/auth/status >/dev/null
curl --fail --silent --show-error --max-time 3 http://127.0.0.1:13039/health >/dev/null
curl --fail --silent --show-error --max-time 3 http://127.0.0.1:13039/thumbnail/health >/dev/null
