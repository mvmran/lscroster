# Access control — roles, permissions and grants

LSCroster is **single-tenant**: each church runs its own instance, so there is no
`tenant_id` anywhere and all access control is **role-based**. Every table has
Row-Level Security (RLS) enabled; the UI mirrors those rules, but RLS at the API
level is the real boundary.

Access is decided by **three independent layers** that add together:

1. **The global role** on `people.role` (`app_role`): `admin`, `coordinator` or
   `member`. One per person.
2. **Per-team grants** (`team_leaders`, `team_viewers`): a person — of *any*
   role — can be made a **Team Leader** or **Team Viewer** of specific teams.
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
- Appoint **Team Leaders** and **Team Viewers** on any team (including
  themselves).
- Service types, and which teams belong to each.
- Conditional rules and their effects.
- Church-wide scheduling preferences, recurring unavailability and prefer/avoid
  pairings — for anyone.
- Mute conditional-rule warnings on a plan (`plan_rule_mutes`).
- Everyone's email preferences.

**People & permissions**
- Grant and revoke member permissions; manage permission templates.
- See everyone's contact details (email, phone, birthday) and notes
  (`can_view_contact()` / the admin-coordinator notes mask).

> **The gap to know about.** A coordinator can create a team and appoint its
> leaders, but **cannot add/remove that team's members, set their positions, or
> roster it** (assign people to positions on a plan) unless they hold that
> team's **Team-Leader grant**. Those actions are gated on `can_manage_team()`,
> which a coordinator does not satisfy by role alone. So today a coordinator who
> wants to run a team must appoint themselves its Team Leader first. (This is the
> open design question behind two known UI/RLS mismatches.)

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

## Per-team grants (any role can hold these)

These are attached to a specific team and apply only to that team. A member, a
coordinator or an admin can all be granted them; only admins and coordinators can
*award* them.

### Team Leader (`team_leaders` → `can_manage_team()`)

The hands-on manager **of the team(s) they lead**. For each such team they can:

- **Add and remove members**, and set which positions each member fills
  (`team_members`, `team_member_positions`).
- Manage the team's **positions** (create/edit position definitions).
- **Roster** the team: create, change and remove plan assignments
  (`plan_assignments`), including sending and cancelling the scheduling requests
  for their team's assignments (`send-requests` / `cancel-assignment`).
- See the plans their team is on (drafts included) and their team's roster.
- See contact details for the members of a team they lead.

They **cannot** touch a team they don't lead, and hold no church-wide governance
powers (no team creation, no appointing leaders, no rules/service types) unless
their global role gives it.

### Team Viewer (`team_viewers` → `views_team()` / `is_viewer_of_plan()`)

A **read-only** window into the teams they view. For a plan any viewed team is
scheduled onto, a Team Viewer can see — including **draft** plans — the plan and
its order of service, times and attachments (`plans`, `plan_items`,
`plan_times`, `plan_attachments`) and that team's roster
(`plan_assignments`). They can change nothing and cannot roster.

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
appointing Team Leaders/Viewers, creating/deleting teams, service types,
conditional rules, pairings and scheduling preferences.

**Permission templates** are presets: applying one *copies* its permissions onto
the person, so editing or deleting the template later changes nobody.

---

## Quick reference

Legend: ✅ yes · ⛔ no · **TL** = only for a team they hold the Team-Leader grant
on · **perm** = if granted the relevant member permission.

| Action | Admin | Coordinator | Team Leader | Team Viewer | Member |
| --- | :---: | :---: | :---: | :---: | :---: |
| Edit/delete people, change roles | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Invite people / create logins | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Church settings, deletion safety | ✅ | ⛔ | ⛔ | ⛔ | ⛔ |
| Create/delete teams, appoint grants | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Service types, conditional rules, pairings | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Grant/revoke member permissions | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| See everyone's contact details & notes | ✅ | ✅ | own team | ⛔ | ⛔ |
| Add/remove team members, set positions | ✅ | **TL** | **TL** | ⛔ | ⛔ |
| Roster a team (plan assignments) | ✅ | **TL** | **TL** | ⛔ | ⛔ |
| Create/delete plans | ✅ | ✅ | ⛔ | ⛔ | **perm** |
| Edit order of service | ✅ | ✅ | ⛔ | ⛔ | **perm** |
| Publish plans + set-list email | ✅ | ✅ | ⛔ | ⛔ | **perm** |
| Manage songs | ✅ | ✅ | ⛔ | ⛔ | **perm** |
| Attach plan files | ✅ | ✅ | ⛔ | ⛔ | **perm** |
| View all plans (drafts included) | ✅ | ✅ | own team's plans | viewed team's plans | **perm** |
| View published plans; respond to own requests; manage own profile & blockouts | ✅ | ✅ | ✅ | ✅ | ✅ |

> Note the two `**TL**` rows for Coordinator: managing a team's membership and
> rostering it require the Team-Leader grant even for a coordinator. Whether that
> should stay true is an open decision.
