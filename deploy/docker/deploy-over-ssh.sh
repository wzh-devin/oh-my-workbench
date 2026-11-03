#!/bin/bash
# Run on the Actions runner; only the release Compose and server script are uploaded.
set -euo pipefail

: "${APP_IMAGE:?}"
: "${DEPLOY_HOST:?}"
: "${DEPLOY_USER:?}"
: "${DEPLOY_KNOWN_HOSTS:?}"
: "${DEPLOY_PATH:?}"
: "${GHCR_USER:?}"
: "${GHCR_TOKEN:?}"
DEPLOY_PORT=${DEPLOY_PORT:-22}

fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ "$APP_IMAGE" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+:v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Invalid release image'
[[ "$DEPLOY_USER" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$ ]] || fail 'Invalid SSH user'
[[ "$DEPLOY_PATH" == /* && "$DEPLOY_PATH" != / && ! "$DEPLOY_PATH" =~ [[:cntrl:]] ]] || fail 'DEPLOY_PATH must be an absolute application directory'
[[ "$DEPLOY_PORT" =~ ^[0-9]{1,5}$ ]] || fail 'Invalid SSH port'
((10#$DEPLOY_PORT >= 1 && 10#$DEPLOY_PORT <= 65535)) || fail 'SSH port must be between 1 and 65535'

umask 077
ssh_dir=$(mktemp -d)
trap 'rm -rf -- "$ssh_dir"' EXIT
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$ssh_dir/known_hosts"

ssh_options=(-T -p "$DEPLOY_PORT" -o StrictHostKeyChecking=yes
  -o GlobalKnownHostsFile=/dev/null
  -o "UserKnownHostsFile=$ssh_dir/known_hosts"
  -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=4)
if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$ssh_dir/key"
  ssh-keygen -y -P '' -f "$ssh_dir/key" >/dev/null
  ssh_options+=(-i "$ssh_dir/key" -o BatchMode=yes -o IdentitiesOnly=yes)
elif [[ -n "${DEPLOY_PASSWORD:-}" ]]; then
  # Askpass preserves stdin for the tar upload and registry token.
  cat > "$ssh_dir/askpass" <<'ASKPASS'
#!/bin/sh
printf '%s\n' "$DEPLOY_PASSWORD"
ASKPASS
  chmod 700 "$ssh_dir/askpass"
  export SSH_ASKPASS="$ssh_dir/askpass" SSH_ASKPASS_REQUIRE=force
  ssh_options+=(-o BatchMode=no -o PreferredAuthentications=password -o NumberOfPasswordPrompts=1)
else
  fail 'Set DEPLOY_PASSWORD or DEPLOY_SSH_KEY'
fi
target="$DEPLOY_USER@$DEPLOY_HOST"

mkdir "$ssh_dir/release"
sed "s|^    image: &app_image .*|    image: \&app_image $APP_IMAGE|" deploy/docker/compose.yaml > "$ssh_dir/release/compose.yaml"
cp deploy/docker/deploy.sh "$ssh_dir/release/deploy.sh"
printf -v remote_path '%q' "$DEPLOY_PATH"
tar -C "$ssh_dir/release" -cf - compose.yaml deploy.sh |
  ssh "${ssh_options[@]}" "$target" "mkdir -p -- $remote_path && tar -xf - -C $remote_path"

printf -v remote_command 'bash %q %q' "$DEPLOY_PATH/deploy.sh" "$GHCR_USER"
printf '%s\n' "$GHCR_TOKEN" | ssh "${ssh_options[@]}" "$target" "$remote_command"
