-- Migration 0006 — Multiple positions per team member & team leaders
-- Issue #1: a person on a team can fill more than one position, so the single
-- team_members.default_position_id is replaced by a team_member_positions join.
-- Issue #2: a team member can be flagged as a leader of that team. This is a
-- label only — management permissions stay the global admin/leader role.

-- team_member_positions -------------------------------------------------------------
-- The set of positions a member can be scheduled into on their team.

create table public.team_member_positions (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, position_id)
);

create index team_member_positions_member_idx on public.team_member_positions (team_member_id);

create trigger team_member_positions_set_updated_at
  before update on public.team_member_positions
  for each row execute function public.set_updated_at();

-- Carry across each member's existing default position, then retire the column.
insert into public.team_member_positions (team_member_id, position_id)
select id, default_position_id
  from public.team_members
 where default_position_id is not null;

alter table public.team_members drop column default_position_id;

-- Issue #2: leader flag on the membership.
alter table public.team_members
  add column is_leader boolean not null default false;

-- RLS: same shape as team_members — everyone reads, leaders/admins manage.

alter table public.team_member_positions enable row level security;

create policy "Authenticated can view team member positions"
  on public.team_member_positions for select
  to authenticated
  using (true);

create policy "Leaders manage team member positions"
  on public.team_member_positions for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());
