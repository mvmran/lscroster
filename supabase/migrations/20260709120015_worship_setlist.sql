-- Worship set-list email on publish (issue #133).
--
-- When a plan is published, a polished set-list PDF can be emailed to a small,
-- admin-curated distribution list (people and/or whole teams). Resend's Batch
-- API doesn't accept attachments, so each recipient costs one rate-limited API
-- call — the list is deliberately curated and capped, hence a dedicated
-- recipients table rather than "everyone rostered".

-- Master switch, off by default so upgrades don't start emailing anyone.
alter table public.church_settings
  add column send_setlist_on_publish boolean not null default false;

-- The set list's "YouTube Reference Link" column: the specific recording an
-- arrangement follows. Lives on the arrangement (like key/BPM/meter) because a
-- medley or alternate arrangement follows its own recording.
alter table public.song_arrangements
  add column reference_url text;

-- setlist_recipients -----------------------------------------------------------------
-- One row per recipient: either a person or a team (expanded to its members at
-- send time by the send-setlist Edge Function). Exactly one of the two is set.

create table public.setlist_recipients (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((person_id is null) <> (team_id is null))
);

-- No duplicate entries for the same person or team.
create unique index setlist_recipients_person_idx
  on public.setlist_recipients (person_id) where person_id is not null;
create unique index setlist_recipients_team_idx
  on public.setlist_recipients (team_id) where team_id is not null;

create trigger setlist_recipients_set_updated_at
  before update on public.setlist_recipients
  for each row execute function public.set_updated_at();

alter table public.setlist_recipients enable row level security;

-- Admins manage the list (Settings → Communications setup); leaders can read it
-- so the plan page can show who a manual "Email set list" will reach.
create policy setlist_recipients_select on public.setlist_recipients
  for select using (public.is_admin_or_leader());

create policy setlist_recipients_insert on public.setlist_recipients
  for insert with check (public.is_admin());

create policy setlist_recipients_delete on public.setlist_recipients
  for delete using (public.is_admin());
