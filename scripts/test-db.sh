#!/usr/bin/env bash
# Runs the pgTAP database tests (supabase/tests/database) against the LOCAL stack.
# `supabase test db` bind-mounts the test directory into a pg_prove container. Docker Desktop can't
# mount some host paths (e.g. external volumes under /Volumes), so the tests are copied to a temp dir first.
set -euo pipefail
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp supabase/tests/database/*.sql "$tmp/"
npx --yes supabase@2 test db "$tmp"
