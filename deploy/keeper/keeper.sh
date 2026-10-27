#!/bin/sh
# Pull every stored dump from Google Drive, restore into an empty Postgres,
# then keep dumping and uploading. The live data directory stays on a local
# Docker volume — a Drive mount corrupts Postgres. The dump is the full database.
set -eu

mkdir -p /backups/postgres /backups/manifests

FOLDER="${GDRIVE_FOLDER:-Playora/data}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-900}"

echo "[keeper] pulling gdrive:${FOLDER}"
if ! rclone copy "gdrive:${FOLDER}" /backups --retries 3 --exclude ".ready"; then
  echo "[keeper] Drive pull failed. Local backups still run. Check RCLONE_GDRIVE_TOKEN."
fi

echo "[keeper] waiting for postgres"
i=0
while ! psql -c "select 1" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[keeper] postgres did not accept queries"
    exit 1
  fi
  sleep 2
done

if [ -f /backups/postgres/latest.dump ]; then
  if psql -tAc "select 1 from _migrations limit 1" >/dev/null 2>&1; then
    echo "[keeper] database already has migrations; leaving it in place"
  else
    echo "[keeper] restoring latest.dump"
    pg_restore --no-owner --no-acl --dbname="${PGDATABASE}" /backups/postgres/latest.dump \
      || echo "[keeper] pg_restore finished with warnings"
  fi
else
  echo "[keeper] no dump on Drive yet"
fi

touch /backups/.ready
echo "[keeper] ready"

while true; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  file="/backups/postgres/${stamp}.dump"
  pg_dump --format=custom --no-owner --file="$file"
  cp -f "$file" /backups/postgres/latest.dump
  find /backups/postgres -type f -name "*.dump" -mtime +14 ! -name "latest.dump" -delete
  printf '{"at":"%s","dump":"postgres/%s.dump","folder":"%s"}\n' \
    "$stamp" "$stamp" "$FOLDER" > "/backups/manifests/${stamp}.json"
  if rclone copy /backups "gdrive:${FOLDER}" --retries 3 --exclude ".ready"; then
    echo "[keeper] stored ${stamp} on Google Drive"
  else
    echo "[keeper] upload failed for ${stamp}; dump kept on the local volume"
  fi
  sleep "$INTERVAL"
done
