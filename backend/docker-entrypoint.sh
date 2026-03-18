#!/bin/sh
set -e
cd /app
if [ -f alembic.ini ]; then
  echo "[entrypoint] Running alembic upgrade head..."
  alembic upgrade head
fi
exec "$@"
