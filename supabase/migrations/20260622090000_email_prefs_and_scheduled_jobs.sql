-- Migration 0020 — Email preferences (#87) + scheduled-job settings (#88)
-- Per-person email opt-outs, and admin-tunable nudge/reminder/publish behaviour.

-- #87 — per-person email preferences -----------------------------------------
-- One row per person. The *absence* of a row means "all enabled" — the Edge
-- Functions default every flag to true when no row exists, so existing people
-- need no backfill. Editable by the person themselves, a leader, or an admin
-- (a managing member is also granted access in the managed-accounts migration).

create table public.person_email_prefs (
  person_id       uuid primary key references public.people (id) on delete cascade,
  roster_emails   boolean not null default true,  -- added to / removed from a plan
  nudge_emails    boolean not null default true,  -- follow-ups chasing a response
  reminder_emails boolean not null default true,  -- pre-service reminders
  publish_emails  boolean not null default true,  -- plan-published summary
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger person_email_prefs_set_updated_at
  before update on public.person_email_prefs
  for each row execute function public.set_updated_at();

alter table public.person_email_prefs enable row level security;

-- Visible to the person and to admins/leaders; managed by the same set.
create policy "View own or any email prefs as leader"
  on public.person_email_prefs for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or person_id = public.current_person_id()
  );

create policy "Members manage their own email prefs"
  on public.person_email_prefs for all
  to authenticated
  using (person_id = public.current_person_id())
  with check (person_id = public.current_person_id());

create policy "Leaders manage email prefs"
  on public.person_email_prefs for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

-- #88 — scheduled-job settings -----------------------------------------------
-- Relax the nudge/reminder ranges so 0 disables that job entirely, retune the
-- defaults (nudge 3, reminder 1), and add a master switch for publish emails.
-- Clamp any existing reminder value to the new ceiling (7) first so the tighter
-- constraint can never fail on upgrade.

update public.church_settings
  set reminder_days_before = least(reminder_days_before, 7);

alter table public.church_settings
  drop constraint church_settings_request_nudge_days_check,
  drop constraint church_settings_reminder_days_before_check;

alter table public.church_settings
  alter column request_nudge_days set default 3,
  alter column reminder_days_before set default 1,
  add constraint church_settings_request_nudge_days_check
    check (request_nudge_days between 0 and 14),
  add constraint church_settings_reminder_days_before_check
    check (reminder_days_before between 0 and 7),
  add column notify_on_publish boolean not null default true;
