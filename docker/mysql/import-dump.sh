#!/usr/bin/env sh
set -eu

DUMP_PATH="${1:-docker/mysql/init/hboo_hbv2.sql}"

if [ ! -f "$DUMP_PATH" ]; then
  echo "Dump file not found: $DUMP_PATH" >&2
  exit 1
fi

docker compose exec -T mysql sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < "$DUMP_PATH"
