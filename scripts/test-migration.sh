#!/usr/bin/env bash
# Proves the conversations migrations convert older, multi-channel history correctly.
# Resets the LOCAL database only. Ends by restoring the normal seed.
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE=20261019080218
DB_CONTAINER=supabase_db_ff14-tools
sb() { npx --yes supabase@2 "$@"; }
psql_db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

restore() { echo "→ restoring the normal local database"; sb db reset >/dev/null; }
trap restore EXIT

echo "→ baseline schema only"
sb db reset --version "$BASELINE" --no-seed
echo "→ loading legacy (old-shape) history"
psql_db < supabase/migration-test/legacy-history.sql
echo "→ applying pending migrations"
sb migration up --local
echo "→ asserting"
psql_db < supabase/migration-test/assert.sql

checksum() {
  psql_db -At -c "select md5(string_agg(x, '|' order by x)) from (
    select 'm:'||id||':'||coalesce(conversation_id::text,'')||':'||coalesce(space,'')||':'||session_id from public.messages
    union all select 's:'||id||':'||visible||':'||coalesce(conversation_id::text,'') from public.sessions
    union all select 'c:'||conversation_id||':'||user_id from public.conversation_members
    union all select 'x:'||id||':'||coalesce(conversation_id::text,'')||':'||coalesce(space,'')||':'||archived from public.channels
    union all select 'mm:'||id||':'||message_id||':'||kind||':'||url||':'||coalesce(extension,'') from public.message_media
    union all select 'p:'||id||':'||coalesce(status_id::text,'')||':'||coalesce(lock_pin_length::text,'') from public.profiles
  ) t(x)"
}
before=$(checksum)

echo "→ re-running every post-baseline migration (idempotency)"
for f in $(ls supabase/migrations/*.sql | sort); do
  v=$(basename "$f" | cut -d_ -f1)
  if [ "$v" -gt "$BASELINE" ]; then psql_db < "$f"; fi
done
psql_db < supabase/migration-test/assert.sql
after=$(checksum)
if [ "$before" != "$after" ]; then echo "✗ re-running the migrations changed data"; exit 1; fi
echo "✓ migration test passed"
