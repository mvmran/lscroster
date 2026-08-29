# Upgrading your instance

New features and fixes land in the upstream repository
([mvmran/lscroster](https://github.com/mvmran/lscroster)) and are cut as tagged
releases. Because you deployed a **fork**, upgrading is: pull the new code, apply
its migrations, redeploy the functions, and let Vercel rebuild the app.

The whole thing takes a few minutes and does not interrupt anyone using the app,
provided you follow the order below.

---

## The one rule: database first, app last

Vercel deploys the moment you push to `main`. If the new bundle reaches your
congregation's browsers before the new tables exist, the app breaks for everyone
until you catch up. So always:

1. `supabase db push` — migrations
2. `supabase functions deploy` — Edge Functions
3. **then** push to `main`, which triggers the Vercel build

The steps below are simply that order written out.

---

## Step by step

### 1. See what is in the release

Releases are tagged `v<major>.<minor>.<patch>`. Read the release notes on the
[Releases page](https://github.com/mvmran/lscroster/releases); anything that needs
action on your part (a new secret, a manual step, a behaviour change your team
will notice) is called out there.

### 2. Pull the upstream code into your fork

Once, to teach your clone where upstream is:

```bash
git remote add upstream https://github.com/mvmran/lscroster.git
```

Then for each upgrade:

```bash
git fetch upstream --tags
```

```bash
git checkout main && git merge v1.2.0
```

Use the tag, not `upstream/main`: tags are the versions that have been through a
release check. If you have never edited any files yourself, this merge is always
clean.

```bash
npm install
```

### 3. Apply the migrations

```bash
npx supabase db push
```

Migrations are additive and re-runnable; applying them to a database that already
has some of them is a no-op for those. Nothing is dropped without it being called
out in the release notes.

### 4. Redeploy the Edge Functions

```bash
npx supabase functions deploy
```

Safe to run every time even when nothing changed — deploying is idempotent.
New functions are picked up automatically; one of them, `generate-meaning`, does
nothing at all unless you have set the optional `GEMINI_API_KEY` secret
(docs/SETUP.md step 6), so there is nothing to do here if you don't want it.

### 5. Release the new app

```bash
git push origin main
```

Vercel builds and deploys automatically. Watch it finish in the Vercel dashboard,
then hard-refresh the app once and check the page you use most.

To confirm which build you are on, open **Settings** and read the footer at the
bottom of the page: it shows the app name, the release version, the commit the
bundle was built from, and the build date. Everyone sees it, so if someone
reports a problem you can ask them for that line.

---

## Trying an upgrade first (recommended for big releases)

With Docker Desktop running:

```bash
npx supabase db reset --local
```

That rebuilds a local database from the migrations, proving the whole chain
applies cleanly from scratch. `npm run dev` then runs the new app against it, and
`npm run db:demo` gives you data to click through.

---

## If something goes wrong

**The app errors after deploying.** Almost always the order rule: run
`npx supabase db push` and reload. Confirm with
`npx supabase migration list --linked` — every migration should appear in both
columns.

**Roll the app back.** In Vercel, **Deployments → the previous one →
Promote to Production**. This reverts the frontend only; the database keeps the
new schema, which is intentional and safe — the schema is designed so the
previous release still runs against it.

**Roll the database back.** Migrations do not have automatic down-scripts. Restore
from a backup ([BACKUPS.md](BACKUPS.md)) and tell us what happened by opening an
issue — a migration that needs rolling back is a bug worth fixing upstream.

---

## Staying in touch with releases

On GitHub, use **Watch → Custom → Releases** on the upstream repository to be
emailed when a new version is tagged. Upgrading every couple of months is plenty;
there is no forced schedule, and your instance keeps working untouched
indefinitely.

Do take security-flagged releases promptly — those are marked in the release
notes.
