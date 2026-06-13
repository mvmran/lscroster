# PHASES.md — LSCRoster Build Plan

Solo developer, vibe-coded with Claude Code. Each phase ends with a **usable release**
deployed to the live Life Sanctuary Church instance. Tick boxes as work completes.
**Phases 0–3 closed** — Phase 3's real-user parallel run (2–4 weeks) continues
alongside. Current phase: **Phase 4 — polish & power features: code complete,
verified locally, deployed to production.** Lighthouse (production, mobile
simulation): accessibility 98 ✓, performance 64 — short of the 90 target.
The score is dominated by simulated slow-4G + 4× CPU throttling against an
SPA shell; on real connections first paint is sub-second. Closing the gap
would need vendor-chunk tuning, deferred fonts and a pre-rendered shell —
worth a dedicated pass if it matters on real phones. Remaining to close
Phase 4: the worship pastor rosters a month in one sitting via the matrix
view, plus a call on whether to chase the Lighthouse performance target.
Phase 5 (distribution) next, after confirmation.

---

## Phase 0 — Foundation & deployment pipeline

**Goal:** an empty but deployed, sign-in-able app. Prove the whole pipeline (GitHub → CI →
Vercel, Supabase migrations) before writing features.

### Deliverables
- [x] GitHub repo `lscroster` with MIT licence, README stub, `.gitignore`, `.env.example`
- [x] Vite + React + TS (strict) scaffold; Tailwind + shadcn/ui installed; base theme (light/dark)
- [x] App shell: responsive sidebar/topbar layout, route placeholders for People / Services / My Schedule / Settings
- [x] Supabase project (Sydney region) created and linked; local stack runs via `supabase start`
- [x] Migration 0001: `church_settings` (single row: name, logo_url, timezone, email_from_name), `people` (with `role app_role`, nullable `auth_user_id`), `updated_at` trigger, RLS on both
- [x] Supabase Auth configured: email+password, public signups **disabled**
- [x] Sign-in page, session handling, protected routes, sign-out
- [x] First-run setup wizard: if `church_settings` empty → create church + first admin (bootstrap path for new instances)
- [x] `send-email` Edge Function wrapping Resend + one test template; secrets set
- [x] GitHub Actions: lint, typecheck, build on PR; Vercel connected to `main`
- [x] `npm run db:types` generating `src/types/database.ts`

### Acceptance criteria
- Fresh clone + SETUP steps → working instance in under 30 minutes (note actual time; this is the distribution benchmark).
- Manoj can sign in as admin on the production URL from his phone.
- A test email lands in an inbox via the Edge Function.

---

## Phase 1 — People module

**Goal:** the church directory and the permission system everything else hangs off.

### Data model
- `people` (exists from Phase 0): first/last name, email, phone, photo_url, birthday (optional), status (`active|inactive`), role, notes
- `invitations`: person_id, token, expires_at, accepted_at

### Deliverables
- [x] People list: search, filter by status/role/team, sort; fast on 200+ records; mobile-friendly cards _(team filter arrives with teams in Phase 3)_
- [x] Person profile page: details, photo upload (Supabase Storage, private bucket, signed URLs), edit
- [x] Create person (no login required — a person is just a record until invited)
- [x] Invite flow: admin sends invitation email → person sets password → `auth_user_id` linked; resend/revoke invitations
- [x] CSV import with column mapping, preview and duplicate detection (match on email)
- [x] Roles & permissions enforced end-to-end: RLS policies + UI gating for admin/leader/member
- [x] Members can edit their own contact details and photo
- [x] Settings → Users page: change roles, deactivate people
- [x] Soft-archive (status `inactive`) instead of delete; hard delete admin-only with confirmation

### Acceptance criteria
- Real LSC congregation imported via CSV.
- A member-level account can see the directory appropriately but cannot edit others or reach admin pages (verified at the API level, not just hidden buttons).
- An invited person can go from email → signed in on a phone in under 2 minutes.

---

## Phase 2 — Services planning core

**Goal:** replicate the heart of Planning Center Services: service types, dated plans, a
drag-and-drop order of service, and a song library.

### Data model
- `service_types`: name, default_start_time, sort_order
- `plans`: service_type_id, date, title (optional), status (`draft|published`), notes
- `plan_items`: plan_id, sort_order, kind (`header|song|item`), title, song_id (nullable), key_override, length_seconds, description
- `songs`: title, author, ccli_number, default_key, bpm (optional), tags[], lyrics/chord text (optional), status
- `song_attachments`: song_id, storage_path, label (chart, mp3, etc.)
- `plan_templates` + `plan_template_items`

### Deliverables
- [x] Service types CRUD (Settings)
- [x] Plans index: upcoming/past per service type, create plan for a date, duplicate a previous plan
- [x] Plan page: order of service with dnd-kit reordering; add header/song/item; per-item length; running clock with computed start times from service start
- [x] Song library: CRUD, search by title/author/CCLI, tags, default key; per-plan key override
- [x] Song attachments: upload/download via Storage (private bucket, signed URLs)
- [x] "Last scheduled" shown on songs (avoid repeating songs week to week)
- [x] Plan templates: save plan as template, create plan from template
- [x] Draft vs published: members only see published plans
- [x] Print-friendly run sheet view (clean CSS print stylesheet)

### Acceptance criteria
- A full LSC Sunday service can be planned start-to-finish, reordered by drag, and printed as a run sheet.
- Times auto-recalculate correctly when items are reordered or resized.
- Leaders can do all of the above; members see published plans read-only.

---

## Phase 3 — Scheduling, rostering & email

**Goal:** the rostering engine — the reason the app exists. Teams, positions, requests,
blockouts, and email accept/decline.

### Data model
- `teams`: name, service_type_id (nullable = all), sort_order
- `positions`: team_id, name, sort_order
- `team_members`: team_id, person_id; fillable positions via `team_member_positions`
- `plan_assignments`: plan_id, person_id, team_id, position_id, status (`pending|confirmed|declined`), token, responded_at, notified_at
- `blockout_dates`: person_id, start_date, end_date, reason (optional)

### Deliverables
- [x] Teams & positions CRUD; manage team membership from team page and from person profile
- [x] Scheduling panel on the plan page: schedule people into positions; warn on blockout conflicts and double-booking the same person on the same date
- [x] Blockouts: members add their own; leaders see them when scheduling; calendar-style picker
- [x] Scheduling request emails (Resend): plan details + **Accept / Decline** buttons using signed single-use token links — no login required
- [x] `respond-to-request` Edge Function: validates token, updates status, shows a friendly confirmation page; decline asks for an optional reason
- [x] In-app responses too: **My Schedule** page listing pending requests and upcoming confirmed dates
- [x] Status visible at a glance on the plan (pending/confirmed/declined colour coding); one-click "find replacement" re-request flow
- [x] Reminder emails via pg_cron → Edge Function: nudge unanswered requests (e.g. after 3 days) and remind confirmed people a configurable number of days before the service
- [x] Email log table for troubleshooting delivery

### Acceptance criteria
- End-to-end on real users: leader schedules a team → members get emails → accept/decline from a phone without logging in → plan updates live.
- Blockout conflicts are impossible to miss when scheduling.
- Reminder emails fire correctly in the church timezone.
- **This phase makes the app daily-driver ready for LSC. Run it in parallel with the old process for 2–4 weeks before switching over.**

---

## Phase 4 — Polish & power features

**Goal:** quality-of-life features that make it feel like a mature product.

### Deliverables
- [x] Matrix view: weeks × positions grid across upcoming plans, with inline scheduling
- [x] Recurring plan creation (e.g. generate next 8 Sundays from a template)
- [x] Multiple times per plan (rehearsal + service times) shown in emails and My Schedule
- [x] Plan attachments (files on plans, not just songs)
- [x] Dashboard/home: this week's plan, my pending requests, my upcoming dates
- [x] PDF export of run sheet
- [x] Song usage reports (frequency, last played, by service type)
- [x] Performance pass: route code-splitting, query caching review, image sizes; instant-feel navigation _(initial bundle 1,085 kB → 381 kB; pages lazy-load; jsPDF only loads on demand)_
- [x] Mobile UX pass on the top flows; PWA manifest + icons (installable; positions the codebase for the future native apps)
- [x] Accessibility pass (keyboard, focus states, contrast) _(dialog descriptions added; Lighthouse accessibility 98)_

### Acceptance criteria
- Worship pastor can roster a month in one sitting via the matrix view.
- Lighthouse: 90+ performance and accessibility on key pages.

---

## Phase 5 — Distribution to other churches

**Goal:** any reasonably technical person at another church can stand up their own instance.

### Deliverables
- [ ] `docs/SETUP.md`: step-by-step — fork repo → create Supabase project → run migrations (`supabase db push`) → set secrets → deploy to Vercel → first-run wizard. Include screenshots.
- [ ] "Deploy with Vercel" button in README
- [ ] Seed script with demo data (sample service type, songs, team) for evaluation, plus a wipe-demo-data command
- [ ] `docs/UPGRADE.md`: pull latest → `supabase db push` → redeploy; versioned releases (git tags) + `CHANGELOG.md`
- [ ] Branding configurable per instance: church name, logo, colour accent, email sender — all via Settings, no code edits
- [ ] Resend setup guide including custom domain/DNS for good email deliverability
- [ ] Backup guidance (Supabase backups; manual `pg_dump` instructions)
- [ ] README: screenshots, feature list, comparison scope vs Planning Center, licence (MIT)
- [ ] Dry run: deploy a second clean instance from the docs alone, timing it; fix every friction point found

### Acceptance criteria
- A second, fully independent instance deployed using only the documentation, in under an hour, with zero code changes.

---

## Out of scope (for now — keep the codebase ready, but do not build)

- Native Android/iPhone apps (future separate project; PWA covers the gap)
- Check-ins, Giving, Groups, Registrations (other Planning Center modules)
- SMS notifications, CCLI reporting integration, ProPresenter/streaming integrations
- Multi-tenant SaaS hosting

## Cost guardrails (~50 users)

Supabase free tier, Vercel Hobby and Resend free tier (3,000 emails/month) comfortably cover
launch scale. Revisit only if storage (song attachments) or email volume grows; first paid
step would likely be Supabase Pro for daily backups.
