#!/bin/sh
set -eu
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
latest="$(find /backups -type f -name '*.dump.enc' | sort | tail -n 1)"
test -n "$latest"
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in="$latest" | pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) FROM destinations;'
