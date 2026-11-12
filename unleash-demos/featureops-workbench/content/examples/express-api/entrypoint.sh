#!/bin/sh
set -e

# If the fragments volume is empty, populate it with defaults
if [ -z "$(ls -A /app/src/fragments 2>/dev/null)" ]; then
  echo "Initializing fragments from defaults..."
  cp -r /app/src/fragments-defaults/* /app/src/fragments/
fi

exec "$@"
