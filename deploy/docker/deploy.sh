#!/bin/bash
# Run on the server; pull must succeed before the current application is stopped.
set -euo pipefail
umask 077
registry_user=${1:?GHCR username is required}
cd -- "$(dirname -- "$0")"
compose=(docker compose --env-file .env.local -f compose.yaml)

on_error() {
  status=$?
  trap - ERR
  printf 'Deployment failed at line %s (exit %s)\n' "$1" "$status" >&2
  # Application logs stay on the server; they can contain credentials or mail data.
  "${compose[@]}" ps || true
  exit "$status"
}
trap 'on_error "$LINENO"' ERR

test -f .env.local
"${compose[@]}" config --quiet
image=$("${compose[@]}" config --images)
# Keep the selected daemon when switching to an isolated registry login directory.
docker_host=${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}
export DOCKER_HOST="$docker_host"
unset DOCKER_CONTEXT
auth_dir=$(mktemp -d)
trap 'rm -rf -- "$auth_dir"' EXIT
plugin_dir=${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins
if test -d "$plugin_dir"; then
  plugin_dir=$(cd -- "$plugin_dir" && pwd)
  ln -s "$plugin_dir" "$auth_dir/cli-plugins"
fi
export DOCKER_CONFIG="$auth_dir"
docker login ghcr.io --username "$registry_user" --password-stdin

"${compose[@]}" pull
expected_id=$(docker image inspect "$image" --format '{{.Id}}')
"${compose[@]}" down
"${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 180

container=$("${compose[@]}" ps -q app)
test -n "$container"
actual_id=$(docker inspect "$container" --format '{{.Image}}')
health=$(docker inspect "$container" --format '{{.State.Health.Status}}')
test "$actual_id" = "$expected_id"
test "$health" = healthy
docker exec "$container" /usr/local/bin/flowly-healthcheck
docker exec "$container" curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8080/ >/dev/null
"${compose[@]}" ps
printf 'Deployed %s (%s)\n' "$image" "$expected_id"
