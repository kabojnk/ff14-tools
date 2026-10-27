#!/usr/bin/env bash
# Builds the site's Docker image on this Mac and swaps it in on the droplet (DEPLOY.md, Option B).
#
#   npm run deploy               build, upload, then ask before swapping the container
#   npm run deploy -- --y        the same, swapping without asking (also -y, --yes)
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
assume_yes=false
for arg in "$@"; do
  case "$arg" in
    --build) build_only=true ;;
    -y | --y | --yes) assume_yes=true ;;
    *) echo "Unknown option: $arg (use --build or --y)" >&2; exit 1 ;;
  esac
done

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
# Whatever holds the port goes, whatever its name (a compose-started site is called e.g. chat-system-app-1),
# plus any old container with our name (running or not).
old=$(ssh "$DEPLOY_HOST" "{ docker ps -a --filter 'publish=$DEPLOY_PORT' --format '{{.Names}}'; docker ps -a --filter 'name=^/$CONTAINER\$' --format '{{.Names}}'; } | sort -u" | tr '\n' ' ')
echo
if [[ -n "${old// /}" ]]; then
  echo "To replace (on port $DEPLOY_PORT or named $CONTAINER): $old"
  compose=$(ssh "$DEPLOY_HOST" "docker inspect --format '{{index .Config.Labels \"com.docker.compose.project\"}}' $old 2>/dev/null | grep -v '^\$' | sort -u" || true)
  [[ -n "$compose" ]] && echo "  Note: started by docker compose (project: $compose). Don't run 'docker compose up' there afterwards, or it takes the port back."
fi
if $assume_yes; then
  echo "Replacing it with the new image as '$CONTAINER' on port $DEPLOY_PORT (--y)."
else
  read -r -p "Replace it with the new image as '$CONTAINER' on port $DEPLOY_PORT? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Stopped. The new image is loaded on the droplet; nothing was swapped."; exit 0; }
fi

echo "==> Swapping the container"
ssh "$DEPLOY_HOST" "set -e
for c in $old; do docker rm -f \"\$c\" >/dev/null; echo \"  removed \$c\"; done
docker run -d --name '$CONTAINER' -p '$DEPLOY_PORT:80' --restart unless-stopped '$IMAGE' >/dev/null
echo '  started $CONTAINER'"

echo "==> Checking the site answers on the droplet"
sleep 2
if ssh "$DEPLOY_HOST" "curl -fsS -o /dev/null -w '  HTTP %{http_code}\n' http://localhost:$DEPLOY_PORT/"; then
  echo "Done. Open the site to check it, then remove old images on the droplet when you like: docker image prune"
else
  echo "The site didn't answer on port $DEPLOY_PORT. Logs: ssh $DEPLOY_HOST docker logs $CONTAINER" >&2
  exit 1
fi
