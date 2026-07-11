# Projection API — Bruno collection

A ready-to-run [Bruno](https://usebruno.com) collection for exercising the two
projection API endpoints. Bruno is a free, offline API client that stores
requests as the plain-text files in this folder, so this collection is safe to
share and diff.

## Use it

1. Install Bruno (https://usebruno.com), then **Open Collection** → pick this
   `projection-api-bruno` folder.
2. Top-right environment selector → choose **Production**.
3. Generate an API key in LSCroster → **Settings → Projection API** (it's shown
   only once). In Bruno, open the Production environment and paste it into the
   **`apiKey`** secret variable.
4. Send **1 · List published services**. If `planId` is empty, it stashes the
   first plan's id there for you.
5. Send **2 · Setlist lyrics for a plan** to get that plan's songs and lyrics.

To target a **specific** service instead of "whatever's first": open the
Production environment and paste that plan's id into `planId` *before*
sending request 1 — request 1 only fills `planId` when it's empty, so your
value is left alone. (If a stale id is stuck in `planId` from a previous
session, clear it via the Runtime Variables panel or edit the environment
value directly, then re-send.)

## Notes

- `apiKey` is a **secret** variable: Bruno keeps its value in your OS keychain /
  a local `.env`, never in these committed files. Each person sets their own.
- The default `baseUrl` points at Life Sanctuary Church's instance. For another
  church's deployment, change it to that project's
  `https://<project-ref>.supabase.co/functions/v1/projection-api`.
- No `.gitignore` needed here — none of these files contain a key. Just don't
  hardcode one into the environment's `vars` block.
- Full contract and field reference: [../PROJECTION-API.md](../PROJECTION-API.md).
- Prefer the terminal? `../PROJECTION-API.md` §11 has the equivalent curl calls.
