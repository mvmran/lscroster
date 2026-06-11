# LSCRoster

Open-source worship & service planning for churches — a lightweight,
self-hosted alternative to Planning Center **Services** with a built-in
people directory.

Each church runs its **own independent instance**: one repo fork, one
[Supabase](https://supabase.com) project, one [Vercel](https://vercel.com)
deployment. No multi-tenancy, no SaaS — your data stays in your own project,
comfortably inside free hosting tiers for a typical congregation (~50 users).

> Built for Life Sanctuary Church, Sydney. Designed to be deployed by any
> church — see `docs/SETUP.md` (coming in Phase 5) for the full guide.

## Stack

Vite + React + TypeScript · Tailwind CSS + shadcn/ui · TanStack Query ·
React Router · Supabase (Postgres, Auth, Storage, Edge Functions) · Resend ·
Vercel

## Local development

```sh
npm install
npx supabase start         # local Supabase stack (requires Docker)
cp .env.example .env.local # fill in the URL + anon key printed by supabase start
npm run dev
```

On first load the app shows a one-time setup wizard that creates your church
and the first admin account.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | local dev server |
| `npm run build` | production build |
| `npm run lint` | eslint |
| `npm run typecheck` | TypeScript check |
| `npm run db:types` | regenerate `src/types/database.ts` from the linked project |
| `npx supabase start` | local Supabase stack (Docker) |
| `npx supabase db reset` | rebuild local DB from migrations |
| `npx supabase db push` | apply migrations to the linked production project |

## Deployment (summary)

1. Create a Supabase project (choose your nearest region), then
   `npx supabase link` and `npx supabase db push`.
2. Disable public signups: Dashboard → Authentication → Sign In / Up →
   turn off "Allow new users to sign up".
3. Deploy Edge Functions:
   `npx supabase functions deploy setup send-email invite accept-invitation delete-person`,
   then set secrets:
   `npx supabase secrets set RESEND_API_KEY=... EMAIL_FROM=... APP_URL=...`
   (`APP_URL` is the public URL of the app — invitation emails build their
   links from it.)
4. Import the repo into Vercel; set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` env vars. Every push to `main` auto-deploys.
5. Open the deployed URL and complete the setup wizard.

### Custom domain & email deliverability

- Add your domain in Vercel (Project → Settings → Domains) and mark it as the
  primary domain so the `*.vercel.app` URL redirects to it.
- Verify the domain in Resend (Domains → Add Domain → add the SPF/DKIM DNS
  records). Use a sender on that domain for `EMAIL_FROM`. Adding a DMARC TXT
  record (`v=DMARC1; p=none;`) further improves deliverability.
- Update the secrets to match: `npx supabase secrets set
  EMAIL_FROM=roster@yourdomain APP_URL=https://yourdomain`.
- In Supabase: Authentication → URL Configuration → set **Site URL** to your
  domain and add it to **Redirect URLs** (used by auth emails such as future
  password resets).

## Deploying changes

- **Frontend** — push/merge to `main`; Vercel builds and deploys automatically.
- **Schema** — add a migration (`npx supabase migration new ...`), test locally
  (`npx supabase db reset`), then `npx supabase db push` and commit the
  regenerated types (`npm run db:types`).
- **Edge Functions** — `npx supabase functions deploy <name>`.
- **Secrets** — `npx supabase secrets set KEY=value` (takes effect on next
  invocation; no redeploy needed).

## Licence

[MIT](LICENSE)
