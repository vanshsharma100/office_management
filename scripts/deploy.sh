#!/bin/sh
# Pull the latest code from GitHub and restart. Run this on the server after
# every push to main:
#
#   ./scripts/deploy.sh
#
# Your data is in a Docker volume, not in the image, so rebuilding never
# touches the records.
set -e

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env file found. Copy .env.production.example to .env and fill it in."
  exit 1
fi

echo "==> Fetching latest code"
git pull

echo "==> Rebuilding and restarting"
docker compose up -d --build

echo "==> Waiting for the app to report healthy"
i=0
until curl -fsS http://localhost:4000/api/health >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "App did not come up in 60s. Logs:"
    docker compose logs --tail 50 app
    exit 1
  fi
  sleep 1
done

echo "==> Deployed. Old images:"
docker image prune -f >/dev/null
echo "    cleaned up."
