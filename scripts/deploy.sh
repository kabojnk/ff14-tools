#!/usr/bin/env bash
# Builds the site's Docker image on this Mac and swaps it in on the droplet (DEPLOY.md, Option B).
#
#   npm run deploy               build, upload, then ask before swapping the container
#   npm run deploy -- --build    build and save chat-system.tar.gz only
#
# Build values come from .env (the production Supabase and Bunny values). The droplet comes from
# .env.deploy (git-ignored; copy .env.deploy.example):
#   DEPLOY_HOST       ssh target, e.g. root@203.0.113.7
#   DEPLOY_PORT       the host port the container listens on today (what Caddy/nginx proxies to)
#   DEPLOY_CONTAINER  container name (default chat-system)
#   DEPLOY_DIR        where the image is uploaded on the droplet (default /opt)
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=chat-system:latest
ARCHIVE=chat-system.tar.gz
build_only=false
[[ "${1:-}" == "--build" ]] && build_only=true

[[ -f .env ]] || { echo "No .env: it holds the production build values (see .env.example)." >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source .env
[[ -f .env.deploy ]] && source .env.deploy
set +a

for v in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_BUNNY_CDN_URL; do
  [[ -n "${!v:-}" ]] || { echo "$v is missing from .env." >&2; exit 1; }
done
case "$VITE_SUPABASE_URL" in
  *127.0.0.1* | *localhost*) echo "VITE_SUPABASE_URL points at a local stack ($VITE_SUPABASE_URL); use the production values." >&2; exit 1 ;;
esac

# The droplet is linux/amd64; this Mac is arm64, so the platform is always given.
echo "==> Building $IMAGE for linux/amd64 (Supabase: $VITE_SUPABASE_URL)"
docker build --platform linux/amd64 \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  --build-arg VITE_BUNNY_CDN_URL="$VITE_BUNNY_CDN_URL" \
  --build-arg VITE_TENOR_API_KEY="${VITE_TENOR_API_KEY:-}" \
  --build-arg VITE_NATIVE_UPDATE_URL="${VITE_NATIVE_UPDATE_URL:-}" \
  -f docker/Dockerfile -t "$IMAGE" .

arch=$(docker image inspect "$IMAGE" --format '{{.Os}}/{{.Architecture}}')
[[ "$arch" == "linux/amd64" ]] || { echo "Built $arch, expected linux/amd64." >&2; exit 1; }

echo "==> Saving $ARCHIVE"
docker save "$IMAGE" | gzip > "$ARCHIVE"
ls -lh "$ARCHIVE"
$build_only && { echo "Built only (--build). Run without it to deploy."; exit 0; }

: "${DEPLOY_HOST:?Set DEPLOY_HOST in .env.deploy (see .env.deploy.example)}"
: "${DEPLOY_PORT:?Set DEPLOY_PORT in .env.deploy: the port the site listens on today}"
CONTAINER=${DEPLOY_CONTAINER:-chat-system}
DIR=${DEPLOY_DIR:-/opt}

echo "==> Uploading to $DEPLOY_HOST:$DIR/$ARCHIVE"
scp "$ARCHIVE" "$DEPLOY_HOST:$DIR/$ARCHIVE"

echo "==> Loading the image on the droplet"
ssh "$DEPLOY_HOST" "docker load < '$DIR/$ARCHIVE'"

echo "==> Running on the droplet now:"
ssh "$DEPLOY_HOST" "docker ps --format '  {{.Names}}  {{.Image}}  {{.Ports}}'"
echo
read -r -p "Replace container '$CONTAINER' with the new image on port $DEPLOY_PORT? [y/N] " answer
[[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Stopped. The new image is loaded on the droplet; nothing was swapped."; exit 0; }

echo "==> Swapping the container"
ssh "$DEPLOY_HOST" "docker rm -f '$CONTAINER' >/dev/null 2>&1 || true
docker run -d --name '$CONTAINER' -p '$DEPLOY_PORT:80' --restart unless-stopped '$IMAGE'"

echo "==> Checking the site answers on the droplet"
sleep 2
if ssh "$DEPLOY_HOST" "curl -fsS -o /dev/null -w '  HTTP %{http_code}\n' http://localhost:$DEPLOY_PORT/"; then
  echo "Done. Open the site to check it, then remove old images on the droplet when you like: docker image prune"
else
  echo "The site didn't answer on port $DEPLOY_PORT. Logs: ssh $DEPLOY_HOST docker logs $CONTAINER" >&2
  exit 1
fi
