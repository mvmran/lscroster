-- Migration 0004 — Scheduling, rostering & email
-- Teams, positions, team membership, plan assignments with signed-token
-- responses, blockout dates, the email log, reminder settings, and the
-- hourly pg_cron job that drives nudge/reminder emails.

-- enums -------------------------------------------------------------------------

create type public.assignment_status as enum ('pending', 'confirmed', 'declined');

-- teams & positions ----------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- null = the team serves every service type
  service_type_id uuid references public.service_types (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index positions_team_idx on public.positions (team_id, sort_order);

create trigger positions_set_updated_at
  before update on public.positions
  for each row execute function public.set_updated_at();

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  default_position_id uuid references public.positions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, person_id)
);

create index team_members_person_idx on public.team_members (person_id);

create trigger team_members_set_updated_at
  before update on public.team_members
  for each row execute function public.set_updated_at();

-- plan assignments ------------------------------------------------------------------
-- One person scheduled into one position on one plan. The emailed response
-- link carries a raw token; only its sha-256 hash is stored (same model as
-- invitations). notified/nudged/reminded timestamps make the reminder job
-- idempotent.

create table public.plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  status public.assignment_status not null default 'pending',
  token_hash text unique,
  responded_at timestamptz,
  decline_reason text,
  notified_at timestamptz,
  nudged_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, person_id, position_id)
);

create index plan_assignments_plan_idx on public.plan_assignments (plan_id);
create index plan_assignments_person_idx on public.plan_assignments (person_id);

create trigger plan_assignments_set_updated_at
  before update on public.plan_assignments
  for each row execute function public.set_updated_at();

-- blockout dates ----------------------------------------------------------------------

create table public.blockout_dates (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index blockout_dates_person_idx on public.blockout_dates (person_id);

create trigger blockout_dates_set_updated_at
  before update on public.blockout_dates
  for each row execute function public.set_updated_at();

-- email log ------------------------------------------------------------------------------
-- Append-only delivery log written by Edge Functions (service role) for
-- troubleshooting. Admin-readable.

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  subject text,
  status text not null default 'sent',
  error text,
  person_id uuid references public.people (id) on delete set null,
  plan_id uuid references public.plans (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger email_log_set_updated_at
  before update on public.email_log
  for each row execute function public.set_updated_at();

-- reminder settings ------------------------------------------------------------------------

alter table public.church_settings
  add column request_nudge_days integer not null default 3
    check (request_nudge_days between 1 and 14),
  add column reminder_days_before integer not null default 2
    check (reminder_days_before between 1 and 14);

-- RLS ----------------------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.positions enable row level security;
alter table public.team_members enable row level security;
alter table public.plan_assignments enable row level security;
alter table public.blockout_dates enable row level security;
alter table public.email_log enable row level security;

-- teams/positions/membership: visible to the whole church; leaders manage.
create policy "Authenticated can view teams"
  on public.teams for select
  to authenticated
  using (true);

create policy "Leaders manage teams"
  on public.teams for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

create policy "Authenticated can view positions"
  on public.positions for select
  to authenticated
  using (true);

create policy "Leaders manage positions"
  on public.positions for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

create policy "Authenticated can view team members"
  on public.team_members for select
  to authenticated
  using (true);

create policy "Leaders manage team members"
  on public.team_members for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

-- Being scheduled onto a plan makes that plan (and its order of service)
-- visible to you even while it's a draft — otherwise My Schedule and the
-- in-app response flow can't show what you're being asked to serve on.
-- security definer so the plans policy can consult plan_assignments without
-- recursing through plan_assignments' own policies (which reference plans).

create or replace function public.is_assigned_to_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.plan_assignments
    where plan_id = target_plan_id
      and person_id = public.current_person_id()
  );
$$;

drop policy "Authenticated can view published plans" on public.plans;
create policy "View published or own assigned plans"
  on public.plans for select
  to authenticated
  using (
    status = 'published'
    or public.is_admin_or_leader()
    or public.is_assigned_to_plan(id)
  );

drop policy "Authenticated can view items of visible plans" on public.plan_items;
create policy "View items of visible plans"
  on public.plan_items for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or public.is_assigned_to_plan(plan_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );

-- plan_assignments: members see their own (any plan status, so My Schedule
-- works on drafts too) plus everyone on published plans; leaders see all.
create policy "View own assignments or those on visible plans"
  on public.plan_assignments for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or person_id = public.current_person_id()
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );

create policy "Leaders manage assignments"
  on public.plan_assignments for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

-- Members may answer their own requests in-app. Row policy scopes to own
-- rows; the trigger below restricts which columns can change.
create policy "Members respond to their own assignments"
  on public.plan_assignments for update
  to authenticated
  using (person_id = public.current_person_id())
  with check (person_id = public.current_person_id());

create or replace function public.protect_assignment_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select auth.role()), 'service_role') = 'service_role'
     or public.is_admin_or_leader() then
    return new;
  end if;
  if new.plan_id is distinct from old.plan_id
     or new.person_id is distinct from old.person_id
     or new.team_id is distinct from old.team_id
     or new.position_id is distinct from old.position_id
     or new.token_hash is distinct from old.token_hash
     or new.notified_at is distinct from old.notified_at
     or new.nudged_at is distinct from old.nudged_at
     or new.reminded_at is distinct from old.reminded_at then
    raise exception 'You can only change your response';
  end if;
  if new.status not in ('confirmed', 'declined') then
    raise exception 'You can only accept or decline';
  end if;
  return new;
end;
$$;

create trigger plan_assignments_protect_columns
  before update on public.plan_assignments
  for each row execute function public.protect_assignment_columns();

-- blockouts: everyone manages their own; leaders see all (scheduling
-- warnings); admins can manage anyone's.
create policy "View own blockouts or any as leader"
  on public.blockout_dates for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or person_id = public.current_person_id()
  );

create policy "Users manage their own blockouts"
  on public.blockout_dates for all
  to authenticated
  using (person_id = public.current_person_id())
  with check (person_id = public.current_person_id());

create policy "Admins manage all blockouts"
  on public.blockout_dates for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- email_log: admins read; only the service role writes (no insert policy).
create policy "Admins can view the email log"
  on public.email_log for select
  to authenticated
  using (public.is_admin());

-- reminders cron job ---------------------------------------------------------------------------
-- Runs hourly; the Edge Function decides whether it's sending time in the
-- church's timezone. The function URL and shared secret live in Vault so the
-- job is a no-op on instances that haven't configured reminders yet:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/reminders', 'reminders_function_url');
--   select vault.create_secret('<long random string>', 'reminders_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'lscroster-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := s.url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', s.secret
    ),
    body := '{}'::jsonb
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets
        where name = 'reminders_function_url') as url,
      (select decrypted_secret from vault.decrypted_secrets
        where name = 'reminders_cron_secret') as secret
  ) s
  where s.url is not null and s.secret is not null
  $$
);
