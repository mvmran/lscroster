-- Migration 0053 — Which reference recording a plan follows.
-- An arrangement can hold several reference recordings (0051). A plan picks one
-- of them per song item — the live take this week, the studio one next — and
-- the Lyrics Sheet's single "Listen" link and the set-list email point at it.
--
-- Null means "the arrangement's first recording", so every existing row keeps
-- the link it shows now and nothing needs backfilling. A stored link that the
-- arrangement no longer lists also falls back to the first (the app decides;
-- the column only holds the choice). Same http(s) rule as reference_urls.
--
-- Templates carry it too, as they do key_override and bpm_override: a column
-- missing from the save-as-template / apply-template round trip would quietly
-- drop the choice.
--
-- No policy changes: both tables already have RLS with table-wide policies,
-- and their table grants cover a new column. Re-runnable.

alter table public.plan_items
  add column if not exists reference_url text
    check (reference_url is null or reference_url ~* '^https?://\S+$');

alter table public.plan_template_items
  add column if not exists reference_url text
    check (reference_url is null or reference_url ~* '^https?://\S+$');

comment on column public.plan_items.reference_url is
  'The arrangement recording this plan follows. Null (or no longer listed) falls back to the arrangement''s first.';
comment on column public.plan_template_items.reference_url is
  'The arrangement recording items created from this template follow. Null falls back to the first.';
