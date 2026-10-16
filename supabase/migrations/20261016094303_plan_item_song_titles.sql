-- Migration 0052 — Song items titled by the song alone.
-- A song added to a plan used to be titled "Song (Arrangement)" for a
-- non-default arrangement. The plan now shows the song name as the title and
-- the arrangement on a small, lighter line under it, so that stored suffix
-- would read twice: "Song (Acoustic)" over "(Acoustic)".
--
-- Only titles that are exactly the old built text are rewritten — the song name
-- (medleys "Song A / Song B") plus " (<arrangement name>)". Anything someone
-- typed is left alone. Data only; no schema change, no new grants. Re-runnable:
-- a second run finds nothing to change.

with names as (
  select x.arrangement_id, string_agg(s.title, ' / ' order by x.sort_order) as songs
  from public.song_arrangement_songs x
  join public.songs s on s.id = x.song_id
  group by x.arrangement_id
)
update public.plan_items pi
set title = n.songs
from public.song_arrangements a
join names n on n.arrangement_id = a.id
where pi.arrangement_id = a.id
  and pi.kind = 'song'
  and not a.is_default
  and pi.title = n.songs || ' (' || a.name || ')';
