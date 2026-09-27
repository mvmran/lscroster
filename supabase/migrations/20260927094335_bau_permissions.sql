-- BAU permissions: named day-to-day jobs a plain member can be granted,
-- without making them a coordinator.
--
-- Until now every plan and song write was `is_admin_or_coordinator()`: to let
-- someone fix the order of service you had to hand them the whole global role,
-- with its governance and personal-data reach. This splits the plan and song
-- work into six grantable permissions:
--
--   edit_order_of_service  items, songs in the plan, keys, times, notes, details
--   publish_plans          publish/unpublish (pins lyrics, emails the roster),
--                          record rule overrides, email the set list
--   create_delete_plans    new/duplicate/delete plans and the plan templates;
--                          implies edit_order_of_service, because creating a
--                          plan from a template or another plan writes its order
--   manage_songs           songs, arrangements, lyrics, song attachments, the AI
--                          helpers
--   attach_plan_files      a plan's attachments
--   view_all_plans         see every plan (drafts included) and its lyrics sheet
--
-- Admins and coordinators hold all of them implicitly, so nobody's access
-- changes on upgrade and nothing is backfilled. Governance — granting these,
-- appointing Team Leaders/Viewers, creating/deleting teams — stays with the
-- coordinator role and is deliberately not grantable.
--
-- Holding any plan permission also lets a member *see* every plan, drafts
-- included: an order-of-service editor has to be able to open the draft they
-- are editing. Rosters of drafts stay as private as before (plan_assignments
-- is untouched).
--
-- Permission templates are presets: applying one copies its permissions onto a
-- person, so editing or deleting a template later changes nobody.
--
-- Also here: two church-wide switches, allow_person_delete and
-- allow_song_delete, both on by default so behaviour is unchanged. Archiving
-- remains the safe alternative in both cases.

-- Types and tables ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_permission') then
    create type public.app_permission as enum (
      'edit_order_of_service',
      'publish_plans',
      'create_delete_plans',
      'manage_songs',
      'attach_plan_files',
      'view_all_plans'
    );
  end if;
end $$;

create table if not exists public.person_permissions (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people (id) on delete cascade,
  permission  public.app_permission not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (person_id, permission)
);

comment on table public.person_permissions is
  'BAU permissions granted to a person. Admins and coordinators hold every permission implicitly; rows matter for members.';

create table if not exists public.permission_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (btrim(name) <> ''),
  permissions  public.app_permission[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists permission_templates_name_key
  on public.permission_templates (lower(btrim(name)));

comment on table public.permission_templates is
  'Named sets of BAU permissions. Applying one copies its permissions onto a person; later edits to the template change nobody.';

drop trigger if exists person_permissions_set_updated_at on public.person_permissions;
create trigger person_permissions_set_updated_at
  before update on public.person_permissions
  for each row execute function public.set_updated_at();

drop trigger if exists permission_templates_set_updated_at on public.permission_templates;
create trigger permission_templates_set_updated_at
  before update on public.permission_templates
  for each row execute function public.set_updated_at();

alter table public.church_settings
  add column if not exists allow_person_delete boolean not null default true,
  add column if not exists allow_song_delete boolean not null default true;

comment on column public.church_settings.allow_person_delete is
  'When false, nobody can delete a person (archive instead). Enforced by RLS and the delete-person Edge Function.';
comment on column public.church_settings.allow_song_delete is
  'When false, nobody can delete a song (archive instead). Enforced by RLS.';

-- Helpers ---------------------------------------------------------------------

-- Does the caller hold permission p? Admins and coordinators always do.
-- create_delete_plans implies edit_order_of_service.
create or replace function public.has_permission(p public.app_permission)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_or_coordinator() or exists (
    select 1
    from public.person_permissions pp
    where pp.person_id = public.current_person_id()
      and (
        pp.permission = p
        or (p = 'edit_order_of_service' and pp.permission = 'create_delete_plans')
      )
  );
$$;

-- May the caller see every plan, drafts included? Any plan permission says yes;
-- manage_songs alone does not.
create or replace function public.can_see_all_plans()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_or_coordinator() or exists (
    select 1
    from public.person_permissions pp
    where pp.person_id = public.current_person_id()
      and pp.permission in (
        'edit_order_of_service', 'publish_plans', 'create_delete_plans',
        'attach_plan_files', 'view_all_plans'
      )
  );
$$;

create or replace function public.song_delete_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select allow_song_delete from public.church_settings limit 1), true);
$$;

create or replace function public.person_delete_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select allow_person_delete from public.church_settings limit 1), true);
$$;

-- RLS: the new tables ---------------------------------------------------------

alter table public.person_permissions enable row level security;
alter table public.permission_templates enable row level security;

-- A person sees their own grants (the app gates its buttons on them), and so
-- does anyone managing them; coordinators see and manage everyone's.
drop policy if exists "View own or managed permissions" on public.person_permissions;
create policy "View own or managed permissions"
  on public.person_permissions for select
  to authenticated
  using (
    public.is_admin_or_coordinator()
    or person_id = public.current_person_id()
    or public.manages_person(person_id)
  );

drop policy if exists "Coordinators grant permissions" on public.person_permissions;
create policy "Coordinators grant permissions"
  on public.person_permissions for insert
  to authenticated
  with check (public.is_admin_or_coordinator());

drop policy if exists "Coordinators revoke permissions" on public.person_permissions;
create policy "Coordinators revoke permissions"
  on public.person_permissions for delete
  to authenticated
  using (public.is_admin_or_coordinator());

drop policy if exists "Coordinators manage permission templates" on public.permission_templates;
create policy "Coordinators manage permission templates"
  on public.permission_templates for all
  to authenticated
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());

-- RLS: plans and their contents ----------------------------------------------
-- Reads: the existing rule, with "admin or coordinator" widened to anyone who
-- holds a plan permission.

alter policy "View published or own assigned plans" on public.plans
  using (
    status = 'published' or public.can_see_all_plans()
    or public.is_assigned_to_plan(id) or public.is_viewer_of_plan(id)
    or public.leads_team_on_plan(id)
  );

alter policy "View items of visible plans" on public.plan_items
  using (
    public.can_see_all_plans() or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id) or public.leads_team_on_plan(plan_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_items.plan_id and p.status = 'published'
    )
  );

alter policy "View times of visible plans" on public.plan_times
  using (
    public.can_see_all_plans() or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id) or public.leads_team_on_plan(plan_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_times.plan_id and p.status = 'published'
    )
  );

alter policy "View attachments of visible plans" on public.plan_attachments
  using (
    public.can_see_all_plans() or public.is_assigned_to_plan(plan_id)
    or public.is_viewer_of_plan(plan_id) or public.leads_team_on_plan(plan_id)
    or exists (
      select 1 from public.plans p
      where p.id = plan_attachments.plan_id and p.status = 'published'
    )
  );

-- plans: create/delete with create_delete_plans; update with either editing or
-- publishing, and the column guard below decides which columns each may touch.
drop policy if exists "Coordinators manage plans" on public.plans;
drop policy if exists "Plan creators insert plans" on public.plans;
create policy "Plan creators insert plans"
  on public.plans for insert
  to authenticated
  with check (public.has_permission('create_delete_plans'));

drop policy if exists "Plan creators delete plans" on public.plans;
create policy "Plan creators delete plans"
  on public.plans for delete
  to authenticated
  using (public.has_permission('create_delete_plans'));

drop policy if exists "Plan editors and publishers update plans" on public.plans;
create policy "Plan editors and publishers update plans"
  on public.plans for update
  to authenticated
  using (
    public.has_permission('edit_order_of_service')
    or public.has_permission('publish_plans')
  )
  with check (
    public.has_permission('edit_order_of_service')
    or public.has_permission('publish_plans')
  );

-- Publishing is a status change; everything else on the row is editing.
-- Compared as jsonb minus the exempt keys so a column added later is guarded
-- as editing by default.
create or replace function public.protect_plan_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select auth.role()), 'service_role') = 'service_role' then
    return new;
  end if;
  if new.status is distinct from old.status
     and not public.has_permission('publish_plans') then
    raise exception 'You do not have permission to publish plans';
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at')
       is distinct from (to_jsonb(old) - 'status' - 'updated_at')
     and not public.has_permission('edit_order_of_service') then
    raise exception 'You do not have permission to edit this plan';
  end if;
  return new;
end;
$$;

drop trigger if exists plans_protect_columns on public.plans;
create trigger plans_protect_columns
  before update on public.plans
  for each row execute function public.protect_plan_columns();

-- plan_items: the order of service. Publishers may update only lyrics_id, which
-- is how publishing pins (and unpublishing releases) each song's lyrics.
drop policy if exists "Coordinators manage plan items" on public.plan_items;
drop policy if exists "Order editors insert plan items" on public.plan_items;
create policy "Order editors insert plan items"
  on public.plan_items for insert
  to authenticated
  with check (public.has_permission('edit_order_of_service'));

drop policy if exists "Order editors delete plan items" on public.plan_items;
create policy "Order editors delete plan items"
  on public.plan_items for delete
  to authenticated
  using (public.has_permission('edit_order_of_service'));

drop policy if exists "Order editors and publishers update plan items" on public.plan_items;
create policy "Order editors and publishers update plan items"
  on public.plan_items for update
  to authenticated
  using (
    public.has_permission('edit_order_of_service')
    or public.has_permission('publish_plans')
  )
  with check (
    public.has_permission('edit_order_of_service')
    or public.has_permission('publish_plans')
  );

create or replace function public.protect_plan_item_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select auth.role()), 'service_role') = 'service_role'
     or public.has_permission('edit_order_of_service') then
    return new;
  end if;
  if (to_jsonb(new) - 'lyrics_id' - 'updated_at')
       is distinct from (to_jsonb(old) - 'lyrics_id' - 'updated_at') then
    raise exception 'You do not have permission to edit the order of service';
  end if;
  return new;
end;
$$;

drop trigger if exists plan_items_protect_columns on public.plan_items;
create trigger plan_items_protect_columns
  before update on public.plan_items
  for each row execute function public.protect_plan_item_columns();

drop policy if exists "Coordinators manage plan times" on public.plan_times;
drop policy if exists "Order editors manage plan times" on public.plan_times;
create policy "Order editors manage plan times"
  on public.plan_times for all
  to authenticated
  using (public.has_permission('edit_order_of_service'))
  with check (public.has_permission('edit_order_of_service'));

drop policy if exists "Coordinators manage plan attachments" on public.plan_attachments;
drop policy if exists "File attachers manage plan attachments" on public.plan_attachments;
create policy "File attachers manage plan attachments"
  on public.plan_attachments for all
  to authenticated
  using (public.has_permission('attach_plan_files'))
  with check (public.has_permission('attach_plan_files'));

-- Storage policies can be created but not altered or dropped by the migration
-- role (storage.objects is owned by Supabase's storage role), so the grant is
-- added beside the existing coordinator policy rather than replacing it.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'File attachers manage plan attachment files'
  ) then
    create policy "File attachers manage plan attachment files"
      on storage.objects for all
      to authenticated
      using (bucket_id = 'plan-attachments' and public.has_permission('attach_plan_files'))
      with check (bucket_id = 'plan-attachments' and public.has_permission('attach_plan_files'));
  end if;
end $$;

drop policy if exists "Coordinators record publish overrides" on public.publish_overrides;
drop policy if exists "Publishers record publish overrides" on public.publish_overrides;
create policy "Publishers record publish overrides"
  on public.publish_overrides for all
  to authenticated
  using (public.has_permission('publish_plans'))
  with check (public.has_permission('publish_plans'));

-- Templates are part of creating plans: read and written by plan creators.
drop policy if exists "Coordinators manage plan templates" on public.plan_templates;
drop policy if exists "Plan creators manage plan templates" on public.plan_templates;
create policy "Plan creators manage plan templates"
  on public.plan_templates for all
  to authenticated
  using (public.has_permission('create_delete_plans'))
  with check (public.has_permission('create_delete_plans'));

drop policy if exists "Coordinators manage plan template items" on public.plan_template_items;
drop policy if exists "Plan creators manage plan template items" on public.plan_template_items;
create policy "Plan creators manage plan template items"
  on public.plan_template_items for all
  to authenticated
  using (public.has_permission('create_delete_plans'))
  with check (public.has_permission('create_delete_plans'));

drop policy if exists "Coordinators manage plan template times" on public.plan_template_times;
drop policy if exists "Plan creators manage plan template times" on public.plan_template_times;
create policy "Plan creators manage plan template times"
  on public.plan_template_times for all
  to authenticated
  using (public.has_permission('create_delete_plans'))
  with check (public.has_permission('create_delete_plans'));

drop policy if exists "Coordinators manage plan template position min counts" on public.plan_template_position_min_counts;
drop policy if exists "Plan creators manage plan template position min counts" on public.plan_template_position_min_counts;
create policy "Plan creators manage plan template position min counts"
  on public.plan_template_position_min_counts for all
  to authenticated
  using (public.has_permission('create_delete_plans'))
  with check (public.has_permission('create_delete_plans'));

-- A new plan copies its source's per-position minimums. That table is otherwise
-- Team Leader territory, which left a coordinator who leads no team unable to
-- create a plan from a template that carried minimums; plan creators may now
-- insert them (update/delete stay with Team Leaders).
drop policy if exists "Plan creators copy plan position min counts" on public.plan_position_min_counts;
create policy "Plan creators copy plan position min counts"
  on public.plan_position_min_counts for insert
  to authenticated
  with check (public.has_permission('create_delete_plans'));

-- RLS: songs -------------------------------------------------------------------

drop policy if exists "Coordinators manage songs" on public.songs;
drop policy if exists "Song managers insert songs" on public.songs;
create policy "Song managers insert songs"
  on public.songs for insert
  to authenticated
  with check (public.has_permission('manage_songs'));

drop policy if exists "Song managers update songs" on public.songs;
create policy "Song managers update songs"
  on public.songs for update
  to authenticated
  using (public.has_permission('manage_songs'))
  with check (public.has_permission('manage_songs'));

drop policy if exists "Song managers delete songs when allowed" on public.songs;
create policy "Song managers delete songs when allowed"
  on public.songs for delete
  to authenticated
  using (public.has_permission('manage_songs') and public.song_delete_allowed());

drop policy if exists "Coordinators manage song arrangements" on public.song_arrangements;
drop policy if exists "Song managers manage song arrangements" on public.song_arrangements;
create policy "Song managers manage song arrangements"
  on public.song_arrangements for all
  to authenticated
  using (public.has_permission('manage_songs'))
  with check (public.has_permission('manage_songs'));

drop policy if exists "Coordinators manage song attachments" on public.song_attachments;
drop policy if exists "Song managers manage song attachments" on public.song_attachments;
create policy "Song managers manage song attachments"
  on public.song_attachments for all
  to authenticated
  using (public.has_permission('manage_songs'))
  with check (public.has_permission('manage_songs'));

drop policy if exists "Coordinators manage song arrangement links" on public.song_arrangement_songs;
drop policy if exists "Song managers manage song arrangement links" on public.song_arrangement_songs;
create policy "Song managers manage song arrangement links"
  on public.song_arrangement_songs for all
  to authenticated
  using (public.has_permission('manage_songs'))
  with check (public.has_permission('manage_songs'));

drop policy if exists "Coordinators manage song arrangement lyrics" on public.song_arrangement_lyrics;
drop policy if exists "Song managers manage song arrangement lyrics" on public.song_arrangement_lyrics;
create policy "Song managers manage song arrangement lyrics"
  on public.song_arrangement_lyrics for all
  to authenticated
  using (public.has_permission('manage_songs'))
  with check (public.has_permission('manage_songs'));

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Song managers manage song attachment files'
  ) then
    create policy "Song managers manage song attachment files"
      on storage.objects for all
      to authenticated
      using (bucket_id = 'song-attachments' and public.has_permission('manage_songs'))
      with check (bucket_id = 'song-attachments' and public.has_permission('manage_songs'));
  end if;
end $$;

-- RLS: people delete honours the switch ------------------------------------------
-- The app deletes people through the delete-person Edge Function (service role),
-- which checks the switch itself; this closes the direct API path too.

alter policy "Admins can delete people" on public.people
  using (public.is_admin() and public.person_delete_allowed());

-- Audit ------------------------------------------------------------------------

create or replace function public.audit_person_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.person_permissions := case when tg_op = 'INSERT' then new else old end;
  v_added  boolean := (tg_op = 'INSERT');
  v_name   text;
  v_label  text := case v_row.permission
    when 'edit_order_of_service' then 'Edit order of service'
    when 'publish_plans'         then 'Publish plans'
    when 'create_delete_plans'   then 'Create & delete plans'
    when 'manage_songs'          then 'Manage songs'
    when 'attach_plan_files'     then 'Attach files to plans'
    when 'view_all_plans'        then 'View all plans & lyrics sheets'
    else v_row.permission::text
  end;
begin
  select nullif(trim(p.first_name || ' ' || p.last_name), '')
    into v_name
    from public.people p
    where p.id = v_row.person_id;

  perform public.audit_record(
    'person.permission_' || (case when v_added then 'add' else 'remove' end),
    v_row.person_id, v_name,
    coalesce(v_name, 'Person')
      || (case when v_added then ' granted "' else ' lost "' end)
      || v_label || '"',
    jsonb_build_object('permission', v_row.permission));

  if v_added then return new; else return old; end if;
end;
$$;

drop trigger if exists audit_person_permissions_aid on public.person_permissions;
create trigger audit_person_permissions_aid
  after insert or delete on public.person_permissions
  for each row execute function public.audit_person_permission();
