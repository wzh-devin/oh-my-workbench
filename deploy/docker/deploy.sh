#!/bin/bash
# Run on the server; pull must succeed before the current application is stopped.
set -euo pipefail
umask 077
registry_user=${1:?GHCR username is required}
cd -- "$(dirname -- "$0")"
deployment_env=.env
if [[ ! -f "$deployment_env" && -f .env.local ]]; then
  deployment_env=.env.local
fi
compose=(docker compose --env-file "$deployment_env" -f compose.yaml)
if [[ -f compose.override.yaml ]]; then
  compose+=(-f compose.override.yaml)
fi

on_error() {
  status=$?
  trap - ERR
  printf 'Deployment failed at line %s (exit %s)\n' "$1" "$status" >&2
  # Application logs stay on the server; they can contain credentials or mail data.
  "${compose[@]}" ps || true
  exit "$status"
}
trap 'on_error "$LINENO"' ERR

if [[ ! -f "$deployment_env" ]]; then
  printf 'Missing deployment configuration: create %s/.env with DATABASE_URL and REDIS_ADDR\n' "$PWD" >&2
  exit 1
fi
"${compose[@]}" config --quiet
image=$("${compose[@]}" config --images | sort -u)
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
# Upgrade the old container's existing keyring before replacing it; new installs have no file.
legacy_directory=
previous=$("${compose[@]}" ps -a -q app)
if [[ -n "$previous" ]]; then
  legacy_directory=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/.secrets"}}{{.Source}}{{end}}{{end}}' "$previous")
fi
if [[ -n "$legacy_directory" ]]; then
  "${compose[@]}" run --rm --no-deps -T --volume "$legacy_directory:/run/legacy-notes:ro" --entrypoint /bin/sh app -ec \
    'exec /usr/local/bin/flowly-api notes-key-import < /run/legacy-notes/notes-keys.json'
fi
# Validate persisted database keys before stopping the current application.
"${compose[@]}" run --rm --no-deps --entrypoint /usr/local/bin/flowly-api app notes-key-check
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
if [[ -n "$legacy_directory" ]]; then
  "${compose[@]}" run --rm --no-deps -T --volume "$legacy_directory:/run/legacy-notes" --entrypoint /bin/sh app -ec \
    '/usr/local/bin/flowly-api notes-key-import < /run/legacy-notes/notes-keys.json && rm -- /run/legacy-notes/notes-keys.json'
  rmdir -- "$legacy_directory" 2>/dev/null || true
  printf 'Legacy notes keys migrated to database and old file removed\n'
fi
"${compose[@]}" ps
printf 'Deployed %s (%s)\n' "$image" "$expected_id"
