#!/usr/bin/env bash
# Restore an archive written by scripts/backup.sh into an EMPTY Supabase
# project: every record, every login (with its password), and every file.
#
#   scripts/restore.sh <archive.tar.gz> <database-connection-string>
#
# The target must already have the schema — `npx supabase db push` from this
# checkout, linked to the target — and nobody in `people` yet. The script
# refuses anything else, so it cannot overwrite a live instance. Files are
# uploaded to the project this checkout is linked to, so link the target first.
# Full procedure, including the secrets to re-set: docs/BACKUPS.md.
#
# Logins: only auth.users and auth.identities are restored. The rest of the auth
# schema is sessions, tokens and audit rows — safe to lose, and tied to the auth
# server's version, so loading them into a newer project can fail.
#
# Drill mode (restore into a local stack, e.g. a throwaway copy on other ports):
#   LOCAL_WORKDIR=<dir with supabase/config.toml> scripts/restore.sh <archive> <url>

set -euo pipefail

ARCHIVE="${1:?usage: scripts/restore.sh <archive.tar.gz> <db-connection-string>}"
DB_URL="${2:?usage: scripts/restore.sh <archive.tar.gz> <db-connection-string>}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# psql comes from the image the Supabase CLI already uses, so nothing else has
# to be installed. Match the project's major version (supabase/config.toml).
PG_IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.136}"

export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ -f "$HOME/.supabase-token" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.supabase-token"
fi

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die() { log "FAILED: $*"; exit 1; }

psql_() {
  docker run --rm -i --network host "$PG_IMAGE" \
    psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"
}

[ -f "$ARCHIVE" ] || die "no such archive: $ARCHIVE"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK"
[ -f "$WORK/data.sql" ] && [ -f "$WORK/manifest.txt" ] || die "not a backup.sh archive"
log "restoring $(sed -n 's/^taken (UTC) *//p' "$WORK/manifest.txt") backup of $(sed -n 's/^project *//p' "$WORK/manifest.txt")"

# Guard: schema present, and no people yet.
people="$(psql_ -tA -c "select count(*) from public.people" 2>&1)" \
  || die "can't read public.people — run 'npx supabase db push' against the target first ($people)"
[ "$people" = "0" ] || die "target already has $people people; restore only into an empty project"

# Everything in public, plus the two auth tables that make up a login.
awk '
  /^COPY "auth"\./ {
    keep = ($2 == "\"auth\".\"users\"" || $2 == "\"auth\".\"identities\"")
    if (!keep) { skip = 1; next }
  }
  skip && /^\\\.$/ { skip = 0; next }
  !skip { print }
' "$WORK/data.sql" >"$WORK/restore.sql"

# One transaction: it all goes in, or nothing does. data.sql starts with
# session_replication_role = replica, so row triggers and foreign keys wait.
psql_ --single-transaction <"$WORK/restore.sql" >/dev/null
log "records and logins restored"

if [ -d "$WORK/storage" ] && [ -n "$(ls -A "$WORK/storage")" ]; then
  if [ -n "${LOCAL_WORKDIR:-}" ]; then
    where=(--workdir "$LOCAL_WORKDIR") scope=(--local)
  else
    where=() scope=(--linked)
  fi
  for dir in "$WORK"/storage/*/; do
    # Copy the bucket's folder to the storage root (ss:///), which keeps each
    # object's path; copying it *into* ss:///<bucket> would nest it one deeper.
    (cd "$REPO" && npx --no-install supabase "${where[@]}" storage cp -r \
      "${dir%/}" ss:/// --experimental "${scope[@]}" >/dev/null)
  done
  log "files restored ($(find "$WORK/storage" -type f | wc -l))"
fi

log "done — compare these with the live counts, then re-set the secrets listed:"
sed -n '/^rows/,/^sha256/p' "$WORK/manifest.txt" | sed '$d'
