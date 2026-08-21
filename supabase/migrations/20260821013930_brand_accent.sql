-- Phase 5 (distribution): brand accent colour as a per-instance setting.
--
-- The whole theme is parameterised on one `--brand-hue` CSS variable
-- (src/index.css); until now re-hueing an instance meant editing that file.
-- Storing the hue here lets each church pick its accent from Settings with no
-- code edit, which is a Phase 5 deliverable ("branding configurable per
-- instance ... all via Settings").
--
-- oklch hue degrees, 0-360. 278 = the deep indigo default shipped in the CSS,
-- so existing instances look identical after this migration.

alter table public.church_settings
  add column if not exists brand_hue smallint not null default 278
    check (brand_hue >= 0 and brand_hue <= 360);

comment on column public.church_settings.brand_hue is
  'Brand accent hue in oklch degrees (0-360); drives the --brand-hue CSS variable. 278 = default indigo.';

-- No new RLS: church_settings is already anon-readable (sign-in page branding)
-- and admin-writable, which is exactly what the accent picker needs.
