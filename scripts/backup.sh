#!/usr/bin/env bash
# Full backup of an LSCroster instance's Supabase project, using only the
# Supabase CLI. Writes one dated archive:
#
#   <dest>/lscroster-<project-ref>-<UTC timestamp>.tar.gz
#     roles.sql      custom database roles (usually empty on a church instance)
#     schema.sql     every schema, as it is in the live project
#     data.sql       every row in public and auth: records AND logins
#     storage/       every file in every bucket (photos, attachments, logo)
#     manifest.txt   row counts, file counts, the migration the database is at,
#                    and the NAMES of the secrets a restore has to re-set
#
# It holds everyone's contact details and every login's password hash: store it
# like the membership roll. Secret *values* are never written — Edge Function
# secrets can't be read back, and Vault is deliberately left out.
#
# Usage:  scripts/backup.sh [dest-dir]        (default ~/dev/backups/lscroster)
#   KEEP=30  archives to keep in dest-dir (oldest pruned after a good run)
#
# Needs: run from a checkout linked to the project (`npx supabase link`),
# Docker running (the CLI runs pg_dump in a container), and a Supabase access
# token — `SUPABASE_ACCESS_TOKEN`, or `~/.supabase-token` exporting it, which
# is what makes it work from cron. See docs/BACKUPS.md.

set -euo pipefail

DEST="${1:-$HOME/dev/backups/lscroster}"
KEEP="${KEEP:-30}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUCKETS=(photos song-attachments plan-attachments church-logo)

# cron starts with a bare PATH and no profile: find node/npx, the user-prefix
# npm and docker, and the access token, the way a login shell would.
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ -f "$HOME/.supabase-token" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.supabase-token"
fi

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die() { log "FAILED: $*"; exit 1; }

cd "$REPO"
[ -f supabase/.temp/project-ref ] || die "not linked — run: npx supabase link --project-ref <ref>"
REF="$(cat supabase/.temp/project-ref)"
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || die "no SUPABASE_ACCESS_TOKEN (and no ~/.supabase-token)"
docker info >/dev/null 2>&1 || die "Docker is not running"

supa() { npx --no-install supabase "$@"; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="lscroster-$REF-$STAMP"
umask 077
mkdir -p "$DEST"
chmod 700 "$DEST"
WORK="$(mktemp -d "$DEST/.$NAME.XXXX")"
trap 'rm -rf "$WORK" "$DEST/$NAME.tar.gz.part"' EXIT

log "backing up $REF to $DEST"

supa db dump --linked --role-only -f "$WORK/roles.sql" >/dev/null 2>"$WORK/err" \
  || die "roles dump: $(tail -3 "$WORK/err")"
supa db dump --linked -f "$WORK/schema.sql" >/dev/null 2>"$WORK/err" \
  || die "schema dump: $(tail -3 "$WORK/err")"
# public = the church's records; auth = logins, so a restore keeps everyone's
# password. storage rows are left out: they come back with the files.
supa db dump --linked --data-only --use-copy --schema public,auth \
  -f "$WORK/data.sql" >/dev/null 2>"$WORK/err" \
  || die "data dump: $(tail -3 "$WORK/err")"
log "database dumped ($(du -h "$WORK/data.sql" | cut -f1) of data)"

# Counts straight from the live project, to check the dump against now and a
# restore against later. `db query -o json` prints the rows as JSON on stdout
# (the login-role line, version notice and any telemetry go to stderr, which we
# drop). CLI 2.107 returns a bare array of row objects; `(.rows? // .)` also
# accepts a `{"rows":[…]}` shape, and `[]?` skips anything unparseable.
query() { supa db query --linked -o json "$1" 2>/dev/null; }
COUNTS="$(query "select 'people' t, count(*) n from people union all
  select 'plans', count(*) from plans union all
  select 'plan_items', count(*) from plan_items union all
  select 'plan_assignments', count(*) from plan_assignments union all
  select 'songs', count(*) from songs union all
  select 'song_arrangement_lyrics', count(*) from song_arrangement_lyrics union all
  select 'teams', count(*) from teams union all
  select 'auth.users', count(*) from auth.users" | jq -r '(.rows? // .)[]? | "\(.t) \(.n)"')" \
  || die "could not read row counts"
[ -n "$COUNTS" ] || die "could not read row counts"
FILES="$(query "select bucket_id b, count(*) n from storage.objects group by 1 order by 1" \
  | jq -r '(.rows? // .)[]? | "\(.b) \(.n)"')"
MIGRATION="$(query "select max(version) v from supabase_migrations.schema_migrations" \
  | jq -r '(.rows? // .)[0]?.v // empty')"
VAULT="$(query "select name from vault.secrets order by name" \
  | jq -r '(.rows? // .)[]?.name' | tr '\n' ' ')"
SECRETS="$(supa secrets list --project-ref "$REF" -o json 2>/dev/null \
  | jq -r 'if type == "array" then .[].name else empty end
           | select(startswith("SUPABASE_") | not)' | tr '\n' ' ')"

# Every data line of a COPY block sits between "COPY <table> ..." and "\.";
# the dump must hold at least as many people rows as the project reports.
dumped_people="$(awk '/^COPY "public"."people" /{on=1;next} /^\\\.$/{on=0} on' "$WORK/data.sql" | wc -l)"
live_people="$(awk '$1=="people"{print $2}' <<<"$COUNTS")"
[ "$dumped_people" -ge "${live_people:-1}" ] \
  || die "data.sql has $dumped_people people rows, the project has $live_people"

mkdir -p "$WORK/storage"
for bucket in "${BUCKETS[@]}"; do
  if grep -q "^$bucket " <<<"$FILES"; then
    supa storage cp -r "ss:///$bucket" "$WORK/storage/$bucket" \
      --experimental --linked >/dev/null 2>"$WORK/err" \
      || die "storage $bucket: $(tail -3 "$WORK/err")"
  fi
done
got_files="$(find "$WORK/storage" -type f | wc -l)"
want_files="$(awk '{s+=$2} END{print s+0}' <<<"$FILES")"
[ "$got_files" -eq "$want_files" ] \
  || die "downloaded $got_files files, storage holds $want_files"
log "storage copied ($got_files files)"

{
  echo "LSCroster backup"
  echo "project      $REF"
  echo "taken (UTC)  $STAMP"
  echo "app commit   $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "migration    $MIGRATION"
  echo
  echo "rows"
  sed 's/^/  /' <<<"$COUNTS"
  echo
  echo "files"
  sed 's/^/  /' <<<"${FILES:-  (none)}"
  echo
  echo "to re-set by hand on restore (values are not in this backup)"
  echo "  Edge Function secrets: $SECRETS"
  echo "  Vault secrets:         $VAULT"
  echo
  echo "sha256"
  (cd "$WORK" && find . -type f ! -name manifest.txt ! -name err -print0 | sort -z \
    | xargs -0 sha256sum | sed 's/^/  /')
} >"$WORK/manifest.txt"
rm -f "$WORK/err"

tar -C "$WORK" -czf "$DEST/$NAME.tar.gz.part" .
mv "$DEST/$NAME.tar.gz.part" "$DEST/$NAME.tar.gz"
log "wrote $DEST/$NAME.tar.gz ($(du -h "$DEST/$NAME.tar.gz" | cut -f1))"

# Prune only after a good archive exists.
mapfile -t old < <(ls -1t "$DEST"/lscroster-"$REF"-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))")
if [ "${#old[@]}" -gt 0 ]; then
  rm -f -- "${old[@]}"
  log "pruned ${#old[@]} old archive(s), keeping $KEEP"
fi
