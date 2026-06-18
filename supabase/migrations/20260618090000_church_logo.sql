-- Church logo (issue #58).
-- The existing church_settings.logo_url holds the light-theme / default logo;
-- add a second column for the dark-theme variant. A public storage bucket backs
-- both so the logo can render on the pre-auth sign-in page (no signed URL).

alter table public.church_settings
  add column if not exists logo_dark_url text;

-- church-logo bucket ---------------------------------------------------------
-- Public: a church logo isn't sensitive and the sign-in page shows it before
-- the user authenticates, so objects are world-readable. Writes stay admin-only.

insert into storage.buckets (id, name, public)
values ('church-logo', 'church-logo', true)
on conflict (id) do nothing;

create policy "Anyone can view church logo files"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'church-logo');

create policy "Admins manage church logo files"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'church-logo' and public.is_admin())
  with check (bucket_id = 'church-logo' and public.is_admin());
