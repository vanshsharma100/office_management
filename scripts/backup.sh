#!/bin/sh
# Copy the live database out to ./backups/ftech-<timestamp>.db
#
#   ./scripts/backup.sh
#
# The app is stopped for the few seconds the copy takes. That is deliberate:
# copying a SQLite file while a write is in flight can produce a torn backup
# that only reveals itself the day you need it.
#
# Run it nightly from cron (3am), keeping the last 30 days:
#   0 3 * * * cd /root/office_management && ./scripts/backup.sh >> backups/backup.log 2>&1
set -e

cd "$(dirname "$0")/.."
mkdir -p backups

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/ftech-$STAMP.db"

echo "[$(date)] pausing app"
docker compose stop app

echo "[$(date)] copying database to $OUT"
docker compose cp app:/app/server/data/ftech.db "$OUT"

echo "[$(date)] restarting app"
docker compose start app

# Keep the 30 most recent, drop the rest.
ls -1t backups/ftech-*.db 2>/dev/null | tail -n +31 | while read -r old; do
  echo "[$(date)] removing old backup $old"
  rm -f "$old"
done

echo "[$(date)] backup complete: $OUT"
