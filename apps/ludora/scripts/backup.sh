#!/usr/bin/env bash
# Backs up Ludora's database and uploaded images from the running compose stack.
#   bash scripts/backup.sh [directory]      (default: apps/ludora/backups)
# Keeps the newest 14 of each (KEEP=30 to keep more). Run it nightly from cron:
#   15 2 * * * cd /srv/codespace/apps/ludora && bash scripts/backup.sh >> backups/backup.log 2>&1
# Copy the backups off the server too: a backup on the same disk dies with it.
set -euo pipefail
cd "$(dirname "$0")/.."
dir=${1:-backups}
keep=${KEEP:-14}
stamp=$(date -u +%Y%m%d-%H%M%S)
umask 077
mkdir -p "$dir"
# Written under a temporary name first, so a failed run never leaves a file that looks complete.
trap 'rm -f "$dir/.ludora-$stamp.dump" "$dir/.uploads-$stamp.tar.gz"' EXIT
docker compose exec -T db pg_dump -U ludora -d ludora --format=custom > "$dir/.ludora-$stamp.dump"
mv "$dir/.ludora-$stamp.dump" "$dir/ludora-$stamp.dump"
docker compose exec -T app tar -C /data -czf - uploads > "$dir/.uploads-$stamp.tar.gz"
mv "$dir/.uploads-$stamp.tar.gz" "$dir/uploads-$stamp.tar.gz"
for kind in ludora uploads; do
  ls -1t "$dir"/$kind-*.* 2>/dev/null | tail -n +$((keep + 1)) | xargs -r rm --
done
echo "$(date -u +%FT%TZ) backed up to $dir/ludora-$stamp.dump and $dir/uploads-$stamp.tar.gz"
