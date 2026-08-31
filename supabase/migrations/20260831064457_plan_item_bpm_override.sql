-- A plan may play a song faster or slower than the arrangement says, the same
-- way it may play it in another key. `key_override` has always been able to say
-- so; this is its counterpart for tempo.
--
-- Null means "whatever the arrangement says", so every existing row keeps the
-- behaviour it has now and nothing needs backfilling. The check mirrors
-- song_arrangements.bpm: a tempo is a whole number of beats above zero.
--
-- Templates carry it too. They copy key_override in both directions — plan
-- saved as template, template applied to plan — and a column missing from one
-- of those paths would quietly drop the override on the round trip.
--
-- No policy changes: RLS is already enabled on both tables and their policies
-- are table-wide (leaders manage, members read), so a new column inherits them.

alter table public.plan_items
  add column if not exists bpm_override integer
    check (bpm_override is null or bpm_override > 0);

alter table public.plan_template_items
  add column if not exists bpm_override integer
    check (bpm_override is null or bpm_override > 0);

comment on column public.plan_items.bpm_override is
  'Tempo for this plan only. Null falls back to the arrangement''s bpm.';
comment on column public.plan_template_items.bpm_override is
  'Tempo for items created from this template. Null falls back to the arrangement''s bpm.';
