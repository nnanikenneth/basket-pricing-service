#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL must be set}"

case "$DATABASE_URL" in
  file:/*) database_path="${DATABASE_URL#file:}" ;;
  *)
    echo "Container DATABASE_URL must use an absolute SQLite path, such as file:/data/basket.db." >&2
    exit 1
    ;;
esac

case "$database_path" in
  *'?'*|*'#'*)
    echo "Container DATABASE_URL must be a plain file path without query parameters or fragments." >&2
    exit 1
    ;;
esac

case "${SEED_DATABASE:-false}" in
  true|false) ;;
  *)
    echo "SEED_DATABASE must be true or false." >&2
    exit 1
    ;;
esac

if [ "$#" -eq 0 ]; then
  echo "A startup command is required." >&2
  exit 1
fi

mkdir -p "$(dirname "$database_path")"
touch "$database_path"

node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma

if [ "${SEED_DATABASE:-false}" = "true" ]; then
  node dist/prisma/seed.js
fi

exec "$@"