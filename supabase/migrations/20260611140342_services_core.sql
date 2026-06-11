-- Migration 0003 — Services planning core
-- Service types, dated plans, order-of-service items, the song library with
-- attachments, plan templates, the song-attachments bucket, and role-based RLS.

-- enums -------------------------------------------------------------------------

create type public.plan_status as enum ('draft', 'published');
create type public.plan_item_kind as enum ('header', 'song', 'item');
create type public.song_status as enum ('active', 'archived');

-- service_types -------------------------------------------------------------------
-- Recurring gatherings, e.g. "Sunday 10am". Managed from Settings.

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_start_time time,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_types_set_updated_at
  before update on public.service_types
  for each row execute function public.set_updated_at();

-- songs -----------------------------------------------------------------------------
-- The song library. Archived songs stay referenced by old plans but are hidden
-- from pickers by default.

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  ccli_number text,
  default_key text,
  bpm integer check (bpm is null or bpm > 0),
  tags text[] not null default '{}',
  lyrics text,
  status public.song_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger songs_set_updated_at
  before update on public.songs
  for each row execute function public.set_updated_at();

-- plans ------------------------------------------------------------------------------
-- One dated instance of a service type. Members only ever see published plans.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  service_type_id uuid not null references public.service_types (id) on delete cascade,
  date date not null,
  title text,
  status public.plan_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plans_service_type_date_idx on public.plans (service_type_id, date);
create index plans_date_idx on public.plans (date);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- plan_items ---------------------------------------------------------------------------
-- A row in the order of service: header, song, or generic item.
-- Songs are deliberately `on delete set null`: removing a song from the library
-- must not silently rewrite the history of past plans.

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  sort_order integer not null default 0,
  kind public.plan_item_kind not null default 'item',
  title text not null,
  song_id uuid references public.songs (id) on delete set null,
  key_override text,
  length_seconds integer not null default 0 check (length_seconds >= 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_items_plan_idx on public.plan_items (plan_id, sort_order);
create index plan_items_song_idx on public.plan_items (song_id);

create trigger plan_items_set_updated_at
  before update on public.plan_items
  for each row execute function public.set_updated_at();

-- song_attachments -----------------------------------------------------------------------
-- Files (charts, mp3s) in the private `song-attachments` bucket; paths are
-- `{song_id}/{uuid}.{ext}` and served via signed URLs.

create table public.song_attachments (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs (id) on delete cascade,
  storage_path text not null unique,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger song_attachments_set_updated_at
  before update on public.song_attachments
  for each row execute function public.set_updated_at();

-- plan templates ----------------------------------------------------------------------------

create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  service_type_id uuid not null references public.service_types (id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plan_templates_set_updated_at
  before update on public.plan_templates
  for each row execute function public.set_updated_at();

create table public.plan_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.plan_templates (id) on delete cascade,
  sort_order integer not null default 0,
  kind public.plan_item_kind not null default 'item',
  title text not null,
  song_id uuid references public.songs (id) on delete set null,
  key_override text,
  length_seconds integer not null default 0 check (length_seconds >= 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_template_items_template_idx
  on public.plan_template_items (template_id, sort_order);

create trigger plan_template_items_set_updated_at
  before update on public.plan_template_items
  for each row execute function public.set_updated_at();

-- song usage -----------------------------------------------------------------------------------
-- "Last scheduled" / "next scheduled" per song. security_invoker so members
-- only see usage from plans their RLS lets them read (published ones).

create view public.song_usage
with (security_invoker = true) as
select
  pi.song_id,
  count(distinct pi.plan_id) as use_count,
  max(p.date) filter (where p.date <= current_date) as last_used,
  min(p.date) filter (where p.date > current_date) as next_scheduled
from public.plan_items pi
join public.plans p on p.id = pi.plan_id
where pi.song_id is not null
group by pi.song_id;

-- RLS --------------------------------------------------------------------------------------------

alter table public.service_types enable row level security;
alter table public.songs enable row level security;
alter table public.plans enable row level security;
alter table public.plan_items enable row level security;
alter table public.song_attachments enable row level security;
alter table public.plan_templates enable row level security;
alter table public.plan_template_items enable row level security;

-- service_types: everyone signed in reads them (plan lists need the names);
-- they are church-level configuration, so only admins manage them.
create policy "Authenticated can view service types"
  on public.service_types for select
  to authenticated
  using (true);

create policy "Admins manage service types"
  on public.service_types for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- plans: members see published plans only; admins and leaders see and manage all.
create policy "Authenticated can view published plans"
  on public.plans for select
  to authenticated
  using (status = 'published' or public.is_admin_or_leader());

create policy "Leaders manage plans"
  on public.plans for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

-- plan_items: visible exactly when their plan is visible.
create policy "Authenticated can view items of visible plans"
  on public.plan_items for select
  to authenticated
  using (
    public.is_admin_or_leader()
    or exists (
      select 1 from public.plans p
      where p.id = plan_id and p.status = 'published'
    )
  );

create policy "Leaders manage plan items"
  on public.plan_items for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

-- songs: the library is readable by everyone signed in; leaders curate it.
create policy "Authenticated can view songs"
  on public.songs for select
  to authenticated
  using (true);

create policy "Leaders manage songs"
  on public.songs for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

create policy "Authenticated can view song attachments"
  on public.song_attachments for select
  to authenticated
  using (true);

create policy "Leaders manage song attachments"
  on public.song_attachments for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

-- templates: a planning tool, leaders/admins only.
create policy "Leaders manage plan templates"
  on public.plan_templates for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

create policy "Leaders manage plan template items"
  on public.plan_template_items for all
  to authenticated
  using (public.is_admin_or_leader())
  with check (public.is_admin_or_leader());

-- song-attachments bucket ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('song-attachments', 'song-attachments', false)
on conflict (id) do nothing;

create policy "Authenticated can view song attachment files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'song-attachments');

create policy "Leaders manage song attachment files"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'song-attachments' and public.is_admin_or_leader())
  with check (bucket_id = 'song-attachments' and public.is_admin_or_leader());
