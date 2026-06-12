-- Migration 0005 — plan times & plan attachments (Phase 4)
-- Multiple labelled times per plan (rehearsal + service) shown on the plan,
-- in My Schedule and in scheduling emails; and file attachments on plans.

-- plan_times --------------------------------------------------------------------

create table public.plan_times (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  label text not null,
  start_time time not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_times_plan_idx on public.plan_times (plan_id, sort_order);

create trigger plan_times_set_updated_at
  before update on public.plan_times
  for each row execute function public.set_updated_at();

-- plan_attachments ----------------------------------------------------------------
-- Files on plans (orders of service, stage layouts…) in the private
-- `plan-attachments` bucket; paths are `{plan_id}/{uuid}.{ext}`.

create table public.plan_attachments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  storage_path text not null unique,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_attachments_plan_idx on public.plan_attachments (plan_id);

create trigger plan_attachments_set_updated_at
  before update on public.plan_attachments
  for each row execute function public.set_updated_at();

-- RLS -------------------------------------------------------------------------------
-- Both tables follow plan_items visibility: leaders see all, members see
-- rows on published plans and on plans they're scheduled onto.

alter table public.plan_times enable row level security;
alter table public.plan_attachments enable row level security;

create policy "View times of visible plans"
  on public.plan_times for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or public.is_assigned_to_plan(plan_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );

create policy "Leaders manage plan times"
  on public.plan_times for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

create policy "View attachments of visible plans"
  on public.plan_attachments for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or public.is_assigned_to_plan(plan_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );

create policy "Leaders manage plan attachments"
  on public.plan_attachments for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

-- plan-attachments bucket --------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('plan-attachments', 'plan-attachments', false)
on conflict (id) do nothing;

create policy "Authenticated can view plan attachment files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'plan-attachments');

create policy "Leaders manage plan attachment files"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'plan-attachments' and public.is_admin_or_leader())
  with check (bucket_id = 'plan-attachments' and public.is_admin_or_leader());
