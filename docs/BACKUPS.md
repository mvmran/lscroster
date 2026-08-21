# Backups

Your church's data lives in your own Supabase project, which means backing it up
is your responsibility. There are two separate things to keep: the **database**
(people, teams, plans, songs, rosters) and the **files** in storage (photos, song
and plan attachments, your logo). A database dump does *not* include the files.

## What Supabase already does for you

| Plan | Automatic backups |
| --- | --- |
| Free | **None.** Take your own dumps — see below. |
| Pro | Daily backups, kept 7 days, restorable from the Dashboard. Point-in-time recovery is a paid add-on. |

If the roster becomes load-bearing for your Sunday — and it will — Supabase Pro
is the cheapest insurance available. Until then, a monthly manual dump is a
perfectly reasonable substitute for a church of this size.

## Backing up the database

From your project folder, with the CLI linked (see [SETUP.md](SETUP.md)):

```bash
npx supabase db dump --linked --data-only --use-copy -f backup-data.sql
```

That is the one that matters: your actual records. The schema is already in the
repository as migrations, so a rebuild is `db push` followed by loading this
file. If you would rather have a single self-contained file:

```bash
npx supabase db dump --linked -f backup-schema.sql
```

Keep the two files together, dated, somewhere off Supabase — a cloud drive or an
encrypted folder on your own machine. **They contain everyone's contact details:
treat them like the membership roll, because that is what they are.**

## Backing up the files

```bash
npx supabase storage cp -r --experimental ss:///photos ./backup/photos
```

Repeat for `song-attachments`, `plan-attachments` and `church-logo`. You can also
download them from the Dashboard under **Storage**, which is easier for a
one-off.

## Restoring

Into a fresh (or emptied) project:

1. `npx supabase link --project-ref <ref>` — the target project.
2. `npx supabase db push` — rebuilds the schema from the migrations.
3. `npx supabase db query --linked -f backup-data.sql` — loads the records back.
4. Copy the storage files back with `supabase storage cp -r --experimental`,
   reversing the direction of the command above.
5. Re-set the secrets and Vault entries (Steps 6 and 7 of [SETUP.md](SETUP.md)) —
   those are deliberately not in any dump.

Logins live in Supabase's `auth` schema and are **not** part of a `--data-only`
dump. After a restore into a new project, invite people again; their `people`
rows, teams and history are all intact and re-link on acceptance.

## Worth doing once a year

Actually run a restore into a throwaway Supabase project. An untested backup is a
hope, not a backup — and this is the cheapest fire drill you will ever run.
