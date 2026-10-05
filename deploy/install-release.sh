#!/usr/bin/env bash
set -euo pipefail

archive=${1:?Usage: install-release.sh ARCHIVE RELEASE_ID}
release_id=${2:?Usage: install-release.sh ARCHIVE RELEASE_ID}
if [[ ! "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo 'Release ID must be a UTC timestamp, e.g. 20261005T220000Z.' >&2
  exit 1
fi
if [[ $(id -u) != 0 ]]; then
  echo 'Run this installer as root.' >&2
  exit 1
fi

root=/opt/pascal
release="$root/releases/$release_id"
export PATH=/opt/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)'
if [[ -e "$release" ]]; then
  echo "Release already exists: $release" >&2
  exit 1
fi
if ! id pascal >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$root" --shell /usr/sbin/nologin pascal
fi
install -d -m 0755 "$root" "$root/releases"
install -d -o pascal -g pascal -m 0700 "$root/shared" "$root/shared/.data" "$root/shared/.npm"
install -d -o pascal -g pascal -m 0750 "$release"
tar --extract --gzip --file "$archive" --directory "$release" --no-same-owner
chown -R pascal:pascal "$release"
ln -s "$root/shared/.data" "$release/.data"

cd "$release"
# The pinned public Git dependency must install without a GitHub SSH identity.
runuser -u pascal -- env PATH="$PATH" npm_config_cache="$root/shared/.npm" \
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf \
  GIT_CONFIG_VALUE_0=ssh://git@github.com/ \
  npm ci --include=dev --no-audit --no-fund
runuser -u pascal -- env PATH="$PATH" npm run check

chown -hR root:pascal "$release"
chmod -R g-w,o-rwx "$release"
systemd-analyze verify "$release/deploy/pascal.service"
touch "$release/.validated"
install -m 0644 "$release/deploy/pascal.service" /etc/systemd/system/pascal.service
systemctl daemon-reload
printf 'Validated Pascal release: %s\n' "$release"
printf 'Install the bot secret at %s/shared/.env, then activate this release.\n' "$root"
