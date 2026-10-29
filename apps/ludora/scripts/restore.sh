#!/usr/bin/env bash
# Puts a backup from scripts/backup.sh back into the compose stack. This
# REPLACES everything in the database (and the images, if given).
#   bash scripts/restore.sh backups/ludora-20261029-021500.dump [backups/uploads-20261029-021500.tar.gz]
# Running games end when the app stops; restore outside lesson time.
set -euo pipefail
cd "$(dirname "$0")/.."
dump=${1:?usage: restore.sh <ludora-*.dump> [uploads-*.tar.gz]}
images=${2:-}
[ -f "$dump" ] || { echo "No such file: $dump" >&2; exit 1; }
[ -z "$images" ] || [ -f "$images" ] || { echo "No such file: $images" >&2; exit 1; }
if [ "${YES:-}" != "1" ]; then
  read -r -p "Replace everything in Ludora's database with $dump? Type yes: " answer
  [ "$answer" = "yes" ] || { echo "Nothing changed."; exit 1; }
fi
trap 'echo "The restore stopped part-way. Start the app again with: docker compose start app" >&2' ERR
docker compose stop app
docker compose exec -T db pg_restore -U ludora -d ludora --clean --if-exists --no-owner < "$dump"
docker compose start app
if [ -n "$images" ]; then
  docker compose exec -T app sh -c 'rm -rf /data/uploads/* && tar -C /data -xzf -' < "$images"
fi
trap - ERR
echo "Restored $dump${images:+ and $images}. The app is starting; it checks the database on start."
