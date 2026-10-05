#!/usr/bin/env bash
set -euo pipefail

release_id=${1:?Usage: activate-release.sh RELEASE_ID}
if [[ ! "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo 'Invalid release ID.' >&2
  exit 1
fi
root=/opt/pascal
release="$root/releases/$release_id"
[[ -f "$release/.validated" && -d "$release/node_modules" && -f "$root/shared/.env" ]]
chown pascal:pascal "$root/shared/.env"
chmod 0600 "$root/shared/.env"

# Authenticate before replacing a running release; never print the token.
/opt/node24/bin/node --env-file="$root/shared/.env" --input-type=module - <<'NODE'
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const token = process.env.DISCORD_TOKEN?.trim();
if (!token) throw new Error('DISCORD_TOKEN is missing.');
const kurryPath = '/opt/kurry/apps/bot/.env';
const kurry = existsSync(kurryPath) ? parseEnv(readFileSync(kurryPath, 'utf8')) : {};
if (token === kurry.DISCORD_TOKEN?.trim()) {
  throw new Error('Pascal must use a separate bot token from Kurry.');
}
const response = await fetch('https://discord.com/api/v10/users/@me', {
  headers: { Authorization: `Bot ${token}` },
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) throw new Error(`Discord rejected the bot credential (${response.status}).`);
const user = await response.json();
if (!user.bot) throw new Error('The credential is not a bot account.');
if (user.id === kurry.DISCORD_CLIENT_ID) throw new Error('This is Kurry’s application, not Pascal’s.');
console.log(`Authenticated Discord bot: ${user.username} (${user.id})`);
NODE

previous=''
if [[ -L "$root/current" ]]; then
  previous=$(readlink -f "$root/current")
fi
ln -s "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
systemctl enable pascal.service
systemctl restart pascal.service

for attempt in $(seq 1 30); do
  sleep 2
  invocation=$(systemctl show pascal.service -p InvocationID --value)
  if systemctl is-active --quiet pascal.service && \
    journalctl "_SYSTEMD_INVOCATION_ID=$invocation" --no-pager -o cat | grep -q 'INFO .*Connected '; then
    printf 'Pascal is connected and running from %s\n' "$release"
    exit 0
  fi
done

echo 'Pascal did not connect within 60 seconds. Stopping the failed release.' >&2
systemctl stop pascal.service
if [[ -n "$previous" && "$previous" != "$release" && -d "$previous" ]]; then
  ln -s "$previous" "$root/current.rollback"
  mv -Tf "$root/current.rollback" "$root/current"
  systemctl start pascal.service
  printf 'Restored previous release: %s\n' "$previous" >&2
fi
exit 1
