-- Migration 0062 — Four tightenings found by `/code-review` over the migrations.
-- Re-runnable.

-- 1. Plan deleters remove only the files of a deleted plan ------------------------
-- 0058 let anyone with `create_delete_plans` delete files in `plan-attachments`,
-- so the files of the plan they had just deleted could go with it. But it let
-- them delete any file in the bucket, at any time — including a live plan's,
-- leaving its attachment row pointing at nothing, with no audit entry (0059
-- audits rows, not files).
--
-- The migration role can create storage policies but not alter or drop them
-- (0045), so 0058's policy stays and a restrictive policy narrows it: a file
-- in the bucket can be deleted by admins, coordinators and file attachers (who
-- manage the bucket and can delete the rows anyway), and by anyone else only
-- once no attachment row points at it. Deleting a plan cascades its rows away
-- before the app removes the files, so that still works.
--
-- The helper is security definer: under RLS a deleter who can't see a plan's
-- attachment rows would see its files as unused.
create or replace function public.plan_file_in_use(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.plan_attachments where storage_path = path)
$$;

revoke all on function public.plan_file_in_use(text) from public, anon;
grant execute on function public.plan_file_in_use(text) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Plan attachment files go only once unused'
  ) then
    create policy "Plan attachment files go only once unused"
      on storage.objects as restrictive for delete
      to authenticated
      using (
        bucket_id <> 'plan-attachments'
        or public.is_admin_or_coordinator()
        or public.has_permission('attach_plan_files')
        or not public.plan_file_in_use(name)
      );
  end if;
end $$;

-- 2. A fixed search_path for the audit label helpers (0059) ------------------------
-- Every other function in 0059 sets one; these two were missed, and the
-- Supabase security advisor flags them (function_search_path_mutable).
alter function public.audit_plan_label(date, text) set search_path = '';
alter function public.audit_count(bigint, text) set search_path = '';

-- 3. No NULL among an arrangement's reference links (0051) -------------------------
-- bool_and skips NULLs, so '{NULL}' or '{https://…, NULL}' passed the check.
-- Redefining the function doesn't recheck existing rows; none hold a NULL.
create or replace function public.all_http_urls(urls text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(coalesce(u ~* '^https?://\S+$', false)), true)
  from unnest(urls) as u
$$;

-- 4. Sequence labels: none NULL, none over 100 characters (0057, 0060) ------------
-- The sequence checks capped how many labels, not what each one holds. The app
-- writes section headings ("Verse 2", "Chorus ×2"), well inside the limit.
create or replace function public.valid_sequence(labels text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select labels is null or (
    pg_catalog.cardinality(labels) <= 200
    and pg_catalog.array_position(labels, null) is null
    and not exists (select 1 from unnest(labels) as l where pg_catalog.length(l) > 100)
  )
$$;

alter table public.song_arrangement_lyrics
  drop constraint if exists song_arrangement_lyrics_sequence_check;
alter table public.song_arrangement_lyrics
  add constraint song_arrangement_lyrics_sequence_check
  check (public.valid_sequence(sequence));

alter table public.plan_items
  drop constraint if exists plan_items_sequence_check;
alter table public.plan_items
  add constraint plan_items_sequence_check
  check (public.valid_sequence(sequence));

alter table public.plan_template_items
  drop constraint if exists plan_template_items_sequence_check;
alter table public.plan_template_items
  add constraint plan_template_items_sequence_check
  check (public.valid_sequence(sequence));
