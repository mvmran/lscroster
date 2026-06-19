-- Migration 0018 — plan template times (issue #73)
-- Templates previously stored only the order of service, so the Times card
-- (Rehearsal, Service, …) was lost when a plan was created from a template.
-- Mirror plan_times onto templates so saving a template captures its times and
-- creating a plan from a template restores them. (Plan -> plan copies — Duplicate
-- and "copy a recent plan" — read plan_times directly and need no schema.)

create table public.plan_template_times (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.plan_templates (id) on delete cascade,
  label text not null,
  start_time time not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_template_times_template_idx
  on public.plan_template_times (template_id, sort_order);

create trigger plan_template_times_set_updated_at
  before update on public.plan_template_times
  for each row execute function public.set_updated_at();

alter table public.plan_template_times enable row level security;

-- Same access model as plan_template_items: a planning tool, leaders/admins only.
create policy "Leaders manage plan template times"
  on public.plan_template_times for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());
