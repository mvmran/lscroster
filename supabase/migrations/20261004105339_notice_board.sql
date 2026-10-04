-- Migration 0049 — Notice board.
-- A short list of PDF notices shown to everyone on Home (the user manual, a
-- message of the day, a roster form…), managed by admins and coordinators from
-- Settings → Manage notice board. Each notice is a one-line message linking to
-- one PDF in the private `notices` bucket; paths are `{uuid}.pdf`.
--
-- PDF only, enforced by the bucket itself (allowed_mime_types): every phone and
-- desktop browser opens a PDF in its own viewer, where an Office file would
-- download and need another app. 20 MB cap, matching the upload form.

-- 1. Table ---------------------------------------------------------------------

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  message text not null
    check (char_length(btrim(message)) between 1 and 200),
  storage_path text not null unique,
  file_name text not null,
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notices_created_at_idx on public.notices (created_at desc);

drop trigger if exists notices_set_updated_at on public.notices;
create trigger notices_set_updated_at
  before update on public.notices
  for each row execute function public.set_updated_at();

-- 2. RLS -------------------------------------------------------------------------
-- Everyone signed in reads the board; admins and coordinators add and remove.
-- There is no edit: a notice is replaced by deleting it and adding another.

alter table public.notices enable row level security;

drop policy if exists "Signed-in people read notices" on public.notices;
create policy "Signed-in people read notices"
  on public.notices for select
  to authenticated
  using (true);

drop policy if exists "Coordinators add notices" on public.notices;
create policy "Coordinators add notices"
  on public.notices for insert
  to authenticated
  with check (public.is_admin_or_coordinator());

drop policy if exists "Coordinators remove notices" on public.notices;
create policy "Coordinators remove notices"
  on public.notices for delete
  to authenticated
  using (public.is_admin_or_coordinator());

-- 3. Bucket ----------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notices', 'notices', false, 20 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Signed-in people read notice files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'notices');

create policy "Coordinators add notice files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'notices' and public.is_admin_or_coordinator());

create policy "Coordinators remove notice files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'notices' and public.is_admin_or_coordinator());
