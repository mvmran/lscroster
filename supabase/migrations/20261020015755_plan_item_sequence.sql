-- Migration 0060 — A song's sequence, for one plan.
-- The sequence (0057) is the order a song is sung in, read from its lyrics'
-- headings and saved with each lyrics version. A plan sometimes sings it its
-- own way — chorus twice at the end this week, no bridge — without the song
-- itself changing. The song box on the plan can now rearrange the sequence for
-- that one item, and the Lyrics Sheet shows it.
--
-- Null means "the song's own": the sequence of the lyrics version the item
-- shows (its pinned one once published, else the latest). Every existing row
-- keeps what it shows now, nothing is backfilled, and a song added again
-- starts from the arrangement's sequence. The app stores an array only when it
-- differs from the song's, so later edits to the song still flow through to
-- an item nobody rearranged.
--
-- Templates carry it too, like key_override, bpm_override and reference_url:
-- a column missing from the save-as-template / apply-template round trip would
-- quietly drop the choice.
--
-- No policy changes: both tables already have RLS with table-wide policies,
-- and their table grants cover a new column. Re-runnable.

alter table public.plan_items
  add column if not exists sequence text[]
    check (sequence is null or cardinality(sequence) <= 200);

alter table public.plan_template_items
  add column if not exists sequence text[]
    check (sequence is null or cardinality(sequence) <= 200);

comment on column public.plan_items.sequence is
  'This plan''s order for the song, as section labels; null = the song''s own (its lyrics version''s).';
comment on column public.plan_template_items.sequence is
  'The order items created from this template sing the song in; null = the song''s own.';
