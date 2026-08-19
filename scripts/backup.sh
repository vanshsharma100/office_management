#!/bin/sh
# Dump the live database out to ./backups/ftech-<timestamp>.sql.gz
#
#   ./scripts/backup.sh
#
# The app keeps running throughout. pg_dump takes a consistent snapshot inside
# a single transaction, so what lands on disk is the database as it was the
# moment the dump began — no torn rows, no stopping anyone's work.
#
# Run it nightly from cron (3am), keeping the last 30 days:
#   0 3 * * * cd /root/office_management && ./scripts/backup.sh >> backups/backup.log 2>&1
#
# To restore one, see DEPLOY.md — restoring is the half nobody rehearses until
# the day it matters.
set -e

cd "$(dirname "$0")/.."
mkdir -p backups

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/ftech-$STAMP.sql.gz"

# The password lives in .env, which docker compose already hands to the db
# container; asking the container to dump itself keeps it out of this script.
echo "[$(date)] dumping database to $OUT"
docker compose exec -T db pg_dump -U ftech --clean --if-exists ftech | gzip > "$OUT"

# A dump that failed halfway still leaves a file behind, and an empty one is
# worse than none: it looks like a backup until you need it.
if [ ! -s "$OUT" ] || [ "$(gzip -dc "$OUT" | head -c 1 | wc -c)" -eq 0 ]; then
  echo "[$(date)] BACKUP FAILED — $OUT is empty, removing it"
  rm -f "$OUT"
  exit 1
fi

# Keep the 30 most recent, drop the rest.
ls -1t backups/ftech-*.sql.gz 2>/dev/null | tail -n +31 | while read -r old; do
  echo "[$(date)] removing old backup $old"
  rm -f "$old"
done

echo "[$(date)] backup complete: $OUT ($(du -h "$OUT" | cut -f1))"
