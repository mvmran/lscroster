# Why LSCroster is built this way

The decisions below are the ones that would be expensive to reverse, and the
reasoning behind each. If you are forking this for your church, or wondering why
something is not the way you would have done it, start here.

---

## One church, one deployment

Each church runs its **own** instance: one repository fork, one Supabase
project, one Vercel project. There is no shared database and no `tenant_id`
column anywhere.

The obvious alternative — one multi-tenant deployment serving many churches —
was rejected on purpose. Single-tenancy buys four things that matter more than
the convenience of running one system:

- **Data isolation is structural, not a policy.** A bug in a row-level-security
  rule cannot leak one church's roster to another, because the other church's
  data is in a different database.
- **RLS stays comprehensible.** Policies only have to answer "what may this
  role do?", never "and is this row theirs?". Every policy in the codebase is
  short enough to read in one sitting, which is why they can be trusted.
- **Everyone stays inside the free tiers.** A congregation of ~50 fits
  comfortably in Supabase's and Vercel's free plans. Pooled into one deployment,
  the same churches would need a paid plan and someone to bill them.
- **Distribution becomes documentation.** "Deploying LSCroster" means following
  [SETUP.md](SETUP.md), not operating a SaaS with uptime obligations to other
  people's Sunday mornings.

The cost is real and worth naming: there is no central place to push a fix, so
every instance owner must upgrade their own copy ([UPGRADE.md](UPGRADE.md)), and
cross-church features are impossible by construction.

Church-specific configuration — name, logo, timezone, accent colour, email
sender — lives in a single-row `church_settings` table filled in by a first-run
wizard, so nothing about any particular church is compiled into the app.

## A person is not an account

`people` is the canonical record, and `people.auth_user_id` is **nullable**.

Half a church roll has no intention of ever signing in, and a planning tool that
cannot represent those people is useless for the half of the job that happens
before anyone logs in. So a person exists first; a login is attached later, if
ever, when they accept an invitation. Roles live on the person record, not on
the auth user.

Accounts are **invite-only** — public sign-up is disabled at the Supabase
project level, and the only path to an account is an admin invitation or the
one-time first-run wizard. A roster app that anyone can register for is a
directory of your congregation's contact details with the door left open.

## The emailed link is the credential

Scheduling requests can be answered **without logging in**. The email contains
`APP_URL/respond/<token>`; only the sha-256 hash of that token is stored, and
the public page calls an Edge Function that treats the token as authentication.

This is a deliberate trade of a little theoretical security for a large amount
of real security. The alternative — "sign in to respond" — produces silence,
and silence gets worked around with group chats and phone calls, which is where
rosters actually go wrong. A single-use, per-assignment token that can only
accept or decline one request, and expires once the service date passes, is a
narrow enough capability to hand out by email.

## The database is the boundary

Every table has RLS enabled. No exceptions.

Hidden buttons are not security, so the UI is treated as a convenience layer
over policies that hold on their own. Anything that must be true — a member sees
only published plans plus the ones they are scheduled onto, a member may change
only their own response columns and not their own role — is enforced by a policy
or a trigger, and verified by probing the API directly with a member token
rather than by looking at the screen.

Where a policy would otherwise recurse (plans referencing assignments
referencing plans), the check moves into a `security definer` helper. That is a
sharp tool, used narrowly, and each use is there because the alternative was a
policy that could not be evaluated at all.

Anything privileged runs in an Edge Function, never in the browser: sending
email, issuing invitations, deleting a person. The service-role key never leaves
the server, and the Resend API key never exists in a bundle.

## Schema changes are migrations, always

Every schema change is a timestamped file in `supabase/migrations/`, and every
migration must be re-runnable on an empty database. Nothing is ever changed in
the Supabase dashboard.

This is not tidiness — it is the entire upgrade path. When another church pulls
a new release, `supabase db push` is what turns their year-old database into the
new one. A schema edited by hand in one instance is a database that can never
receive an upgrade again. The same property is what makes the setup guide
credible: standing up a new instance runs the exact same migrations that built
the oldest one.

Anything that would break an existing instance — a renamed column, a changed
email link — needs a migration path and a note in that release's notes.

## Email is logged, and slow on purpose

All outbound mail goes through one helper, and **every send attempt is written
to `email_log`** with its result, visible to admins in the app. When a volunteer
says "I never got it", the answer is a row, not a shrug.

Scheduled mail — nudges for unanswered requests, reminders before a service, the
weekly roster-status digest — all hangs off a **single hourly** `pg_cron` job
that calls one function, which decides what (if anything) is due this hour in
the church's own timezone. One schedule is easier to reason about and to prove
working than three, and each job can be retimed or switched off entirely from
Settings without touching the database.

The cron job authenticates with a shared secret held in Supabase Vault, so the
function can be public-facing without being callable by strangers.

## Times are stored absolutely, displayed locally

Everything is `timestamptz`; display converts to the timezone in
`church_settings`. Service times are the one thing a roster tool cannot get
wrong, and a church that spans a daylight-saving boundary or has a member
travelling should still see one unambiguous answer.

## One variable's worth of branding

Instance branding is a single oklch hue in `church_settings`, from which every
accent colour derives. Not a theme system, not per-component overrides — one
number.

The point is that a second church should not look like the first, and should not
need a developer to achieve that. A hue picker in Settings re-tints the whole
interface for everyone, instantly, with no code change and no redeploy. Anything
more configurable would have to be maintained forever.

## Sunday-morning-proof

Mobile-first is a requirement, not a preference: most people open this on a
phone, one-handed, minutes before a service starts. Big touch targets, obvious
states, and the fewest possible clicks for the two things that actually happen
often — see this week's plan, answer a request.

That priority also settles the performance question. Lighthouse's mobile score
models a slow phone on a throttled connection; accessibility, which affects
every real user every week, is treated as the number worth chasing, and the
simulated performance score is not.

## A small, boring stack

The stack is fixed — Vite, React, TypeScript in strict mode, Tailwind,
TanStack Query, Supabase, Resend, Vercel — and new dependencies are added
reluctantly.

This is a project maintained by one person in spare hours, on which other
people's Sunday services depend. Every library is something to upgrade, audit
and eventually replace. TypeScript is strict and external input is validated
with schemas at every boundary, because the failure mode of this app is not a
crash — it is a plausible-looking roster that is quietly wrong.

## Versioning

The **git tag is the version**. Releases are cut as annotated tags with matching
GitHub releases, and instance owners upgrade by merging a tag rather than
tracking `main`, so they only ever land on a state that was deliberately
released. `package.json` stays at `0.0.0`: nothing reads it, the app is never
published to a registry, and a version that lives in two places is a version
that will disagree with itself.

## Deliberately not built

- Native mobile apps — the installable web app covers the gap
- Check-ins, Giving, Groups, Registrations — other tools do these well
- SMS, CCLI reporting integration, projection-software integrations beyond the
  read-only [Projection API](PROJECTION-API.md)
- Multi-tenant hosting — see the first section; this one is not a "not yet"

---

Implementation details, per-issue history and the running build log are kept in
the maintainer's working notes rather than here. This file is only for decisions
whose reasoning outlives the code that implements them.
