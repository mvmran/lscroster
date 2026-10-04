# Access control — roles, permissions and grants

LSCroster is **single-tenant**: each church runs its own instance, so there is no
`tenant_id` anywhere and all access control is **role-based**. Every table has
Row-Level Security (RLS) enabled; the UI mirrors those rules, but RLS at the API
level is the real boundary.

Access is decided by **three independent layers** that add together:

1. **The global role** on `people.role` (`app_role`): `admin`, `coordinator` or
   `member`. One per person.
2. **Per-team access** (`team_grants`): a person — of *any* role — can be given
   one graded level on specific teams: **Viewer**, **Scheduler** or **Manager**.
3. **Member permissions** (`person_permissions`): six day-to-day jobs a member
   can be granted individually. Admins and coordinators hold all six implicitly.

A person's effective access is the union of whatever each layer grants. The
sections below describe each, then give a quick-reference matrix. Everything
here is enforced by RLS helper functions (named in parentheses) — see
`supabase/migrations` for the policies.

---

## The global roles

### Admin — everything

Admins can do anything in the church instance. In addition to every coordinator
power below, **only** an admin can:

- Edit or delete a person's record, and change anyone's role (`people`).
- Send invitations / create logins (`invitations`).
- Manage **anyone's** blockouts (`blockout_dates`).
- Change **church settings**, including the deletion-safety switches for people
  and songs (`church_settings`).
- Manage member photos, the church logo, and projection API keys.

### Coordinator — church-wide governance

A coordinator governs the church-wide **structures and content**. They hold all
six member permissions implicitly (`has_permission()` is true for them), plus
everything gated on `is_admin_or_coordinator()`:

**Plans & content**
- Create, edit and delete plans; edit the order of service; use plan templates.
- Publish plans and send the set-list email.
- Manage songs (create/edit/delete) and use the AI helpers.
- Attach files to plans; manage song- and plan-attachment files.
- View **every** plan, drafts included.

**Scheduling governance**
- Create, rename and delete **teams**.
- Grant **team access** — Viewer, Scheduler or Manager — on any team (including
  themselves).
- Service types, and which teams belong to each.
- Conditional rules and their effects.
- Church-wide scheduling preferences, recurring unavailability and prefer/avoid
  pairings — for anyone.
- Mute conditional-rule warnings on a plan (`plan_rule_mutes`).
- Everyone's email preferences.
- The **notice board** on Home: add and remove its PDFs (`notices`, bucket
  `notices`). Everyone signed in reads it.

**People & permissions**
- Grant and revoke member permissions; manage permission templates.
- See everyone's contact details (email, phone, birthday) and notes
  (`can_view_contact()` / the admin-coordinator notes mask).

**Team management.** A coordinator governs **every** team church-wide: they can
add/remove any team's members, set their positions, and **roster** any team
(assign people on a plan, send/cancel requests, mute rule warnings) without
holding a per-team grant — they satisfy both `can_manage_team()` and
`can_schedule_team()` by role. Members with a Manager or Scheduler grant keep
their own per-team scope alongside this.

### Member — themselves, and what they're given

A plain member (no grants, no permissions) can:

- View **published** plans, plus any plan they are personally scheduled onto
  (even drafts), via `is_assigned_to_plan()`.
- Respond to their own scheduling requests — accept/decline — in-app or from the
  email link, without logging in. Answers can change until the service date
  passes.
- Manage their **own** profile and blockouts.

Everything beyond that comes from a per-team grant or a member permission.

---

## Per-team access (any role can hold it)

A single graded grant per person per team (`team_grants.access`, migration
0048), set from one dropdown on the **Team Access** card. It applies only to
that team. Anyone — member, coordinator or admin — can be granted it, but only
admins and coordinators *award* it. The three levels are ordered
**Viewer ⊂ Scheduler ⊂ Manager**; admins and coordinators hold **Manager** on
every team implicitly.

### Viewer (`views_team()` / `is_viewer_of_plan()`)

A **read-only** window into the team. For the team's plans — including **draft**
plans — a Viewer sees the plan and its order of service, times and attachments
(`plans`, `plan_items`, `plan_times`, `plan_attachments`) and the team's roster
(`plan_assignments`). They change nothing.

### Scheduler (`can_schedule_team()`)

Everything a Viewer sees, **plus rostering**:

- **Schedule** the team: create, change and remove plan assignments
  (`plan_assignments`), including sending and cancelling the scheduling requests
  (`send-requests` / `cancel-assignment`).
- Set per-plan position targets and mute a plan's rule warnings.
- See contact details for the team's members.

A Scheduler **cannot** change who is on the team.

### Manager (`can_manage_team()`)

Everything a Scheduler can do, **plus the team's structure**:

- **Add and remove members**, and set which positions each member fills
  (`team_members`, `team_member_positions`).
- Manage the team's **positions** (create/edit position definitions).

A grant applies only to its own team, and carries no church-wide governance
(no team creation, no appointing grants, no rules/service types) unless the
person's global role gives it.

---

## Member permissions (the six BAU grants)

`person_permissions` lets an admin or coordinator grant a member specific
day-to-day jobs **without** promoting them to a global role. Each is checked by
`has_permission()` in RLS, `callerHasPermission()` in Edge Functions and
`usePermissions()` in the app. **Admins and coordinators hold all six
implicitly** — a "limited" person is a member with a subset of these.

| Permission | What it lets a member do |
| --- | --- |
| `edit_order_of_service` | Edit a plan's order of service (items, headers, songs, durations). Does **not** include creating or deleting the plan. |
| `create_delete_plans` | Create and delete plans, and use plan templates. **Implies `edit_order_of_service`** (creating from a template writes the order). |
| `publish_plans` | Publish a plan (and unpublish), and send the set-list email. |
| `manage_songs` | Create, edit and delete songs, and use the AI song helpers. |
| `attach_plan_files` | Upload and manage a plan's attachment files. |
| `view_all_plans` | See **every** plan's lyrics/order sheet, drafts included — not just plans they're on. |

Two things that follow from the design:

- **Any** plan permission lets the member **see every plan** (drafts included),
  because you must be able to open the plan you're editing/publishing
  (`can_see_all_plans()`). Draft **rosters** stay private — the permission opens
  the order of service and lyrics, not who is scheduled.
- Permissions are **church-wide** in scope (there is no per-service-type limit
  yet), and are **not** the same as rostering. Rostering is always the per-team
  Team-Leader grant, never a permission.

**Not grantable as a permission** (coordinator/admin only): granting permissions,
granting team access, creating/deleting teams, service types,
conditional rules, pairings and scheduling preferences.

**Permission templates** are presets: applying one *copies* its permissions onto
the person, so editing or deleting the template later changes nobody.

---

## Quick reference

Legend: ✅ yes · ⛔ no · **perm** = if granted the relevant member permission.
The **Manager / Scheduler / Viewer** columns are the per-team access level a
person holds *on that team* — the ability applies only to the team they hold it
on, and stacks with their global role and permissions.

| Action | Admin | Coordinator | Manager | Scheduler | Viewer | Member |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Edit/delete people, change roles | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Invite people / create logins | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Church settings, deletion safety | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Create/delete teams, appoint access | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Service types, conditional rules, pairings | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Grant/revoke member permissions | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Add/remove notice board PDFs | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Add/remove team members, set positions | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Roster a team (plan assignments), email it | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| Set per-plan targets, mute rule warnings | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| See the team's members' contact details | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| View the team's plans & roster (incl. drafts) | ✅ | ✅ | ✅ | ✅ | ✅ | ⛔ |
| Create/delete plans | ✅ | ✅ | ⛔ | ⛔ | ⛔ | **perm** |
| Edit order of service | ✅ | ✅ | ⛔ | ⛔ | ⛔ | **perm** |
| Publish plans + set-list email | ✅ | ✅ | ⛔ | ⛔ | ⛔ | **perm** |
| Manage songs | ✅ | ✅ | ⛔ | ⛔ | ⛔ | **perm** |
| Attach plan files | ✅ | ✅ | ⛔ | ⛔ | ⛔ | **perm** |
| View all plans (drafts included) | ✅ | ✅ | ⛔ | ⛔ | ⛔ | **perm** |
| View published plans; respond to own requests; manage own profile & blockouts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> The three per-team columns are cumulative: a Manager can do everything a
> Scheduler can, and a Scheduler everything a Viewer can. Admins and coordinators
> hold Manager on every team by role, so they never need a grant.
