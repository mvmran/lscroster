# Backups

Your church's data lives in your own Supabase project, which means backing it up
is your responsibility. There are two separate things to keep: the **database**
(people, logins, teams, plans, songs, rosters) and the **files** in storage
(photos, song and plan attachments, your logo). A database dump does *not*
include the files; the script below takes both.

## What Supabase already does for you

| Plan | Automatic backups |
| --- | --- |
| Free | **None.** Take your own — see below. |
| Pro | Daily backups, kept 7 days, restorable from the Dashboard. Point-in-time recovery is a paid add-on. |

If the roster becomes load-bearing for your Sunday — and it will — Supabase Pro
is the least-effort insurance available: nothing to schedule, nothing to test.
On the free plan, a nightly scripted backup to a machine you control is a
perfectly good substitute for a church of this size.

## The scripted backup

`scripts/backup.sh` takes a complete backup with nothing but the Supabase CLI
and Docker, and writes one dated archive:

```bash
scripts/backup.sh                      # → ~/backups/lscroster/
scripts/backup.sh /mnt/usb/lscroster   # anywhere else
```

Each `lscroster-<project-ref>-<UTC time>.tar.gz` holds:

| File | What it is |
| --- | --- |
| `data.sql` | Every row of your records **and every login**, password hashes included, so a restore keeps everyone's password |
| `storage/` | Every file in every bucket |
| `schema.sql`, `roles.sql` | The live schema, as a reference; a restore rebuilds it from the migrations instead |
| `manifest.txt` | Row and file counts to check a restore against, the migration the database was at, a checksum per file, and the **names** of the secrets a restore must re-set |

It needs a checkout of this repository **linked** to your project
(`npx supabase link`, SETUP.md) with its `npm install` done, Docker running, and
a Supabase access token — either `SUPABASE_ACCESS_TOKEN` in the environment or
a `~/.supabase-token` file containing `export SUPABASE_ACCESS_TOKEN=…`
(mode 600). The file is what makes it work from cron, which reads no profile.
A run takes about a minute. It fails loudly — non-zero exit, `FAILED:` in the
log — if a dump fails, if the data dump holds fewer people than the project, or
if a file is missing, and only then prunes: it keeps the newest 30 archives
(`KEEP=60 scripts/backup.sh` to keep more).

**The archive is the membership roll**: names, phone numbers, birthdays and
password hashes. The script writes it mode 600 into a mode 700 folder. Keep it
out of anything that syncs to a shared or cloud folder unless that folder is
encrypted, and keep at least one copy somewhere other than the machine that
takes it — a backup on the same disk as the only copy is not a backup.

### Every night, from cron

On a Linux machine that stays on (or macOS), `crontab -e` and add:

```cron
# LSCroster backup at 02:30 every night
30 2 * * * /path/to/lscroster/scripts/backup.sh >> $HOME/backups/lscroster/backup.log 2>&1
```

Check `backup.log` now and then: every good night ends with a `wrote …`
line. The simplest alarm is the date on the newest archive.

## Backing up by hand

The same thing, one command at a time — for Windows, or a one-off:

```bash
npx supabase db dump --linked --data-only --use-copy --schema public,auth -f data.sql
npx supabase db dump --linked -f schema.sql
npx supabase storage cp -r ss:///photos ./storage/photos --experimental --linked
```

Repeat the last line for `song-attachments`, `plan-attachments` and
`church-logo` (an empty bucket just leaves an empty folder). You can also
download files from the Dashboard under **Storage**.

## Restoring

A restore goes into a **new, empty** Supabase project — never on top of a live
one. `scripts/restore.sh` refuses a database that already has anyone in
`people`.

1. Create the project and follow SETUP.md from linking through deploying the
   functions: `npx supabase link --project-ref <new-ref>`, `npx supabase db
   push`, `npx supabase functions deploy`. **Don't** run the setup wizard —
   your church settings come back with the data.
2. Re-set the secrets and Vault entries (SETUP.md steps 6 and 7). The backup's
   `manifest.txt` lists their names; the values are deliberately not in it.
3. Get the database connection string: Dashboard → **Connect** → *Session
   pooler* (it works over IPv4; the direct one may not).
4. From the same linked checkout:

   ```bash
   scripts/restore.sh ~/backups/lscroster/lscroster-<ref>-<time>.tar.gz \
     'postgresql://postgres.<new-ref>:<db-password>@<pooler-host>:5432/postgres'
   ```

   It loads every record and login in one transaction — all of it or none of
   it — uploads the files, then prints the counts to compare with the live
   project.
5. Point the app at the new project (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY` in Vercel) and redeploy. Everyone signs in with the
   password they already had.

Only `auth.users` and `auth.identities` are restored from the auth schema. The
rest of it is sessions, tokens and audit rows: safe to lose, and tied to the
auth server's version, so a newer project can reject them. (Loading the whole
data dump in one go fails for exactly that reason; so does
`supabase db query -f data.sql`, which cannot read `COPY` data at all — use the
script.)

## Worth doing once a year

Restore the newest archive somewhere and look at it. An untested backup is a
hope, not a backup. A free throwaway project works; so does a second **local**
stack beside your development one: copy `supabase/config.toml`, migrations and
`seed.sql` into a scratch folder, change `project_id` and move the ports
(`543xx` → `553xx`), then:

```bash
npx supabase --workdir <scratch> start
LOCAL_WORKDIR=<scratch> scripts/restore.sh <archive> \
  postgresql://postgres:postgres@127.0.0.1:55322/postgres
npx supabase --workdir <scratch> stop --no-backup   # deletes the copy
```

Compare the counts it prints with the manifest, and sign in as someone. Then
throw it away — it is a full copy of your membership.
