-- ============================================================================
-- LSCroster demo data (Phase 5 — for evaluating a fresh instance)
--
-- Loads a small, believable church: three teams with positions, twelve people,
-- a weekly service type, six songs and three plans (last Sunday, this Sunday
-- with a full order of service and roster, and next Sunday as a draft).
--
-- Safe to run on an instance you have just set up. Everything it creates has an
-- id starting with `0de00` ("demo"), so `demo-wipe.sql` removes exactly this
-- data and nothing you have added yourself. Re-running is idempotent.
--
-- The demo people deliberately have NO email address: they cannot be invited or
-- emailed by accident while you are evaluating. Give one a real address from the
-- People page when you want to try invitations or scheduling requests.
--
--   Local:  docker exec -i supabase_db_lscroster psql -U postgres -d postgres \
--             < supabase/seeds/demo-data.sql
--   Hosted: Supabase Dashboard -> SQL Editor -> paste this file -> Run
-- ============================================================================

begin;

-- People ---------------------------------------------------------------------
insert into public.people (id, first_name, last_name, role, status, sex, notes) values
  ('0de00001-0000-4000-8000-000000000001', 'Ava',    'Nguyen',    'leader', 'active', 'female', 'Demo data'),
  ('0de00001-0000-4000-8000-000000000002', 'Daniel', 'Okafor',    'member', 'active', 'male',   'Demo data'),
  ('0de00001-0000-4000-8000-000000000003', 'Grace',  'Tan',       'member', 'active', 'female', 'Demo data'),
  ('0de00001-0000-4000-8000-000000000004', 'Josh',   'Fernandez', 'member', 'active', 'male',   'Demo data'),
  ('0de00001-0000-4000-8000-000000000005', 'Hannah', 'Roberts',   'member', 'active', 'female', 'Demo data'),
  ('0de00001-0000-4000-8000-000000000006', 'Peter',  'Mwangi',    'member', 'active', 'male',   'Demo data'),
  ('0de00001-0000-4000-8000-000000000007', 'Mia',    'Kowalski',  'member', 'active', 'female', 'Demo data'),
  ('0de00001-0000-4000-8000-000000000008', 'Sam',    'Whitfield', 'member', 'active', 'male',   'Demo data'),
  ('0de00001-0000-4000-8000-000000000009', 'Ruth',   'Abadi',     'member', 'active', 'female', 'Demo data'),
  ('0de00001-0000-4000-8000-00000000000a', 'Caleb',  'Storey',    'member', 'active', 'male',   'Demo data'),
  ('0de00001-0000-4000-8000-00000000000b', 'Ellie',  'Park',      'member', 'active', 'female', 'Demo data'),
  ('0de00001-0000-4000-8000-00000000000c', 'Tom',    'Bright',    'member', 'active', 'male',   'Demo data'),
  ('0de00001-0000-4000-8000-00000000000d', 'Naomi',  'Silva',     'member', 'active', 'female', 'Demo data'),
  ('0de00001-0000-4000-8000-00000000000e', 'Isaac',  'Chen',      'member', 'active', 'male',   'Demo data'),
  ('0de00001-0000-4000-8000-00000000000f', 'Deb',    'Alvarez',   'member', 'active', 'female', 'Demo data')
on conflict (id) do nothing;

-- Teams ----------------------------------------------------------------------
insert into public.teams (id, name, sort_order, team_type) values
  ('0de00002-0000-4000-8000-000000000001', 'Worship',     1, 'worship'),
  ('0de00002-0000-4000-8000-000000000002', 'Media',       2, 'media'),
  ('0de00002-0000-4000-8000-000000000003', 'Hospitality', 3, 'general')
on conflict (id) do nothing;

-- Positions ------------------------------------------------------------------
insert into public.positions (id, team_id, name, sort_order, min_count, max_count) values
  ('0de00003-0000-4000-8000-000000000001', '0de00002-0000-4000-8000-000000000001', 'Worship Leader',    1, 1, 1),
  ('0de00003-0000-4000-8000-000000000002', '0de00002-0000-4000-8000-000000000001', 'Acoustic Guitar',   2, 1, 1),
  ('0de00003-0000-4000-8000-000000000003', '0de00002-0000-4000-8000-000000000001', 'Electric Guitar',   3, 0, 1),
  ('0de00003-0000-4000-8000-000000000004', '0de00002-0000-4000-8000-000000000001', 'Bass',              4, 1, 1),
  ('0de00003-0000-4000-8000-000000000005', '0de00002-0000-4000-8000-000000000001', 'Keys',              5, 1, 1),
  ('0de00003-0000-4000-8000-000000000006', '0de00002-0000-4000-8000-000000000001', 'Drums',             6, 1, 1),
  ('0de00003-0000-4000-8000-000000000007', '0de00002-0000-4000-8000-000000000001', 'Vocals',            7, 2, 3),
  ('0de00003-0000-4000-8000-000000000008', '0de00002-0000-4000-8000-000000000002', 'Sound',             1, 1, 1),
  ('0de00003-0000-4000-8000-000000000009', '0de00002-0000-4000-8000-000000000002', 'Lyrics/Projection', 2, 1, 1),
  ('0de00003-0000-4000-8000-00000000000a', '0de00002-0000-4000-8000-000000000002', 'Camera',            3, 0, 1),
  ('0de00003-0000-4000-8000-00000000000b', '0de00002-0000-4000-8000-000000000003', 'Welcome',           1, 2, 2),
  ('0de00003-0000-4000-8000-00000000000c', '0de00002-0000-4000-8000-000000000003', 'Morning Tea',       2, 1, 2)
on conflict (id) do nothing;

-- Team membership ------------------------------------------------------------
insert into public.team_members (id, team_id, person_id) values
  ('0de00007-0000-4000-8000-000000000101', '0de00002-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000001'),
  ('0de00007-0000-4000-8000-000000000102', '0de00002-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000002'),
  ('0de00007-0000-4000-8000-000000000103', '0de00002-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000003'),
  ('0de00007-0000-4000-8000-000000000104', '0de00002-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000004'),
  ('0de00007-0000-4000-8000-000000000105', '0de00002-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000005'),
  ('0de00007-0000-4000-8000-000000000106', '0de00002-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000006'),
  ('0de00007-0000-4000-8000-000000000107', '0de00002-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000007'),
  ('0de00007-0000-4000-8000-000000000208', '0de00002-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000008'),
  ('0de00007-0000-4000-8000-000000000209', '0de00002-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000009'),
  ('0de00007-0000-4000-8000-00000000020a', '0de00002-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-00000000000a'),
  ('0de00007-0000-4000-8000-00000000030b', '0de00002-0000-4000-8000-000000000003', '0de00001-0000-4000-8000-00000000000b'),
  ('0de00007-0000-4000-8000-00000000030c', '0de00002-0000-4000-8000-000000000003', '0de00001-0000-4000-8000-00000000000c'),
  ('0de00007-0000-4000-8000-00000000010d', '0de00002-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-00000000000d'),
  ('0de00007-0000-4000-8000-00000000020e', '0de00002-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-00000000000e'),
  ('0de00007-0000-4000-8000-00000000030f', '0de00002-0000-4000-8000-000000000003', '0de00001-0000-4000-8000-00000000000f')
on conflict (id) do nothing;

-- What each member can play/do (drives auto-scheduling and validation).
insert into public.team_member_positions (team_member_id, position_id, proficiency)
select m.team_member_id::uuid, m.position_id::uuid, m.proficiency::public.proficiency_level
from (values
  ('0de00007-0000-4000-8000-000000000101', '0de00003-0000-4000-8000-000000000001', 'qualified'),
  ('0de00007-0000-4000-8000-000000000101', '0de00003-0000-4000-8000-000000000002', 'qualified'),
  ('0de00007-0000-4000-8000-000000000102', '0de00003-0000-4000-8000-000000000003', 'qualified'),
  ('0de00007-0000-4000-8000-000000000102', '0de00003-0000-4000-8000-000000000004', 'qualified'),
  ('0de00007-0000-4000-8000-000000000103', '0de00003-0000-4000-8000-000000000005', 'qualified'),
  ('0de00007-0000-4000-8000-000000000103', '0de00003-0000-4000-8000-000000000007', 'qualified'),
  ('0de00007-0000-4000-8000-000000000104', '0de00003-0000-4000-8000-000000000006', 'qualified'),
  ('0de00007-0000-4000-8000-000000000105', '0de00003-0000-4000-8000-000000000007', 'qualified'),
  ('0de00007-0000-4000-8000-000000000106', '0de00003-0000-4000-8000-000000000004', 'trainee'),
  ('0de00007-0000-4000-8000-000000000106', '0de00003-0000-4000-8000-000000000006', 'qualified'),
  ('0de00007-0000-4000-8000-000000000107', '0de00003-0000-4000-8000-000000000007', 'qualified'),
  ('0de00007-0000-4000-8000-000000000107', '0de00003-0000-4000-8000-000000000001', 'trainee'),
  ('0de00007-0000-4000-8000-000000000107', '0de00003-0000-4000-8000-000000000002', 'qualified'),
  ('0de00007-0000-4000-8000-000000000208', '0de00003-0000-4000-8000-000000000008', 'qualified'),
  ('0de00007-0000-4000-8000-000000000209', '0de00003-0000-4000-8000-000000000009', 'qualified'),
  ('0de00007-0000-4000-8000-00000000020a', '0de00003-0000-4000-8000-00000000000a', 'qualified'),
  ('0de00007-0000-4000-8000-00000000020a', '0de00003-0000-4000-8000-000000000008', 'trainee'),
  ('0de00007-0000-4000-8000-00000000030b', '0de00003-0000-4000-8000-00000000000b', 'qualified'),
  ('0de00007-0000-4000-8000-00000000030c', '0de00003-0000-4000-8000-00000000000b', 'qualified'),
  ('0de00007-0000-4000-8000-00000000030c', '0de00003-0000-4000-8000-00000000000c', 'qualified'),
  ('0de00007-0000-4000-8000-00000000010d', '0de00003-0000-4000-8000-000000000007', 'qualified'),
  ('0de00007-0000-4000-8000-00000000020e', '0de00003-0000-4000-8000-00000000000a', 'qualified'),
  ('0de00007-0000-4000-8000-00000000020e', '0de00003-0000-4000-8000-000000000008', 'trainee'),
  ('0de00007-0000-4000-8000-00000000030f', '0de00003-0000-4000-8000-00000000000c', 'qualified')
) as m(team_member_id, position_id, proficiency)
on conflict (team_member_id, position_id) do nothing;

-- Service type ---------------------------------------------------------------
insert into public.service_types
  (id, name, default_start_time, end_time, sort_order, frequency, days_of_week)
values
  ('0de00004-0000-4000-8000-000000000001', 'Sunday 10am', '10:00', '11:30', 1, 'weekly', '{0}')
on conflict (id) do nothing;

insert into public.service_type_teams (id, service_type_id, team_id, sort_order) values
  ('0de00004-0000-4000-8000-000000000101', '0de00004-0000-4000-8000-000000000001', '0de00002-0000-4000-8000-000000000001', 1),
  ('0de00004-0000-4000-8000-000000000102', '0de00004-0000-4000-8000-000000000001', '0de00002-0000-4000-8000-000000000002', 2),
  ('0de00004-0000-4000-8000-000000000103', '0de00004-0000-4000-8000-000000000001', '0de00002-0000-4000-8000-000000000003', 3)
on conflict (id) do nothing;

-- Songs ----------------------------------------------------------------------
-- Public-domain hymns only: no copyrighted lyrics ship with the demo data.
-- A trigger creates each song's Default arrangement automatically.
insert into public.songs (id, title, author, ccli_number, tags, status, copyright) values
  ('0de00005-0000-4000-8000-000000000001', 'Amazing Grace',             'John Newton',          '22025',  '{hymn,opener}',   'active', 'Public domain'),
  ('0de00005-0000-4000-8000-000000000002', 'Be Thou My Vision',         'Traditional Irish',    '30639',  '{hymn}',          'active', 'Public domain'),
  ('0de00005-0000-4000-8000-000000000003', 'Great Is Thy Faithfulness', 'Thomas O. Chisholm',   '18723',  '{hymn}',          'active', 'Public domain'),
  ('0de00005-0000-4000-8000-000000000004', 'Holy, Holy, Holy',          'Reginald Heber',       '1156',   '{hymn,opener}',   'active', 'Public domain'),
  ('0de00005-0000-4000-8000-000000000005', 'It Is Well With My Soul',   'Horatio G. Spafford',  '25376',  '{hymn,response}', 'active', 'Public domain'),
  ('0de00005-0000-4000-8000-000000000006', 'Come Thou Fount',           'Robert Robinson',      '108389', '{hymn}',          'active', 'Public domain')
on conflict (id) do nothing;

-- Give each Default arrangement a key, tempo and meter.
update public.song_arrangements a
set song_key = v.song_key, bpm = v.bpm, meter = v.meter
from (values
  ('0de00005-0000-4000-8000-000000000001', 'G', 72, '3/4'),
  ('0de00005-0000-4000-8000-000000000002', 'D', 84, '3/4'),
  ('0de00005-0000-4000-8000-000000000003', 'C', 76, '3/4'),
  ('0de00005-0000-4000-8000-000000000004', 'D', 92, '4/4'),
  ('0de00005-0000-4000-8000-000000000005', 'C', 70, '4/4'),
  ('0de00005-0000-4000-8000-000000000006', 'D', 96, '4/4')
) as v(song_id, song_key, bpm, meter)
where a.is_default
  and a.song_key is null
  and exists (
    select 1 from public.song_arrangement_songs sas
    where sas.arrangement_id = a.id and sas.song_id = v.song_id::uuid
  );

-- One lyrics version per Default arrangement (verse 1 only — enough to show the
-- lyrics sheet, the projection API and the section parser).
insert into public.song_arrangement_lyrics (arrangement_id, lyrics)
select sas.arrangement_id, v.lyrics
from (values
  ('0de00005-0000-4000-8000-000000000001', E'Verse 1\nAmazing grace, how sweet the sound\nThat saved a wretch like me\nI once was lost, but now am found\nWas blind, but now I see'),
  ('0de00005-0000-4000-8000-000000000002', E'Verse 1\nBe Thou my vision, O Lord of my heart\nNaught be all else to me, save that Thou art\nThou my best thought, by day or by night\nWaking or sleeping, Thy presence my light'),
  ('0de00005-0000-4000-8000-000000000003', E'Verse 1\nGreat is Thy faithfulness, O God my Father\nThere is no shadow of turning with Thee\nThou changest not, Thy compassions they fail not\nAs Thou hast been Thou forever wilt be'),
  ('0de00005-0000-4000-8000-000000000004', E'Verse 1\nHoly, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee\nHoly, holy, holy! Merciful and mighty!\nGod in three Persons, blessed Trinity!'),
  ('0de00005-0000-4000-8000-000000000005', E'Verse 1\nWhen peace like a river attendeth my way\nWhen sorrows like sea billows roll\nWhatever my lot, Thou hast taught me to say\nIt is well, it is well with my soul'),
  ('0de00005-0000-4000-8000-000000000006', E'Verse 1\nCome Thou fount of every blessing\nTune my heart to sing Thy grace\nStreams of mercy never ceasing\nCall for songs of loudest praise')
) as v(song_id, lyrics)
join public.song_arrangement_songs sas on sas.song_id = v.song_id::uuid
join public.song_arrangements a on a.id = sas.arrangement_id and a.is_default
where not exists (
  select 1 from public.song_arrangement_lyrics l where l.arrangement_id = sas.arrangement_id
);

-- Plans ----------------------------------------------------------------------
-- Dated relative to today: last Sunday (past, published), the coming Sunday
-- (published, fully rostered) and the Sunday after (draft, partly rostered).
-- date_trunc('week', ...) is the Monday of this week, so -1 is last Sunday.
insert into public.plans (id, service_type_id, date, title, status, start_time, notes)
select
  v.id::uuid,
  '0de00004-0000-4000-8000-000000000001',
  v.plan_date,
  v.title,
  v.status::public.plan_status,
  '10:00',
  v.notes
from (values
  ('0de00006-0000-4000-8000-000000000001', (date_trunc('week', current_date)::date - 1),
   'Grace Upon Grace', 'published', 'Communion Sunday. Kids stay in for the first two songs.'),
  ('0de00006-0000-4000-8000-000000000002', (date_trunc('week', current_date)::date + 6),
   'Faithful Through It All', 'published', 'Guest speaker. Please be set up by 9:15am.'),
  ('0de00006-0000-4000-8000-000000000003', (date_trunc('week', current_date)::date + 13),
   'Songs of Loudest Praise', 'draft', 'Draft - roster not finalised.')
) as v(id, plan_date, title, status, notes)
on conflict (id) do nothing;

insert into public.plan_times (id, plan_id, label, start_time, sort_order) values
  ('0de00008-0000-4000-8000-000000000101', '0de00006-0000-4000-8000-000000000001', 'Rehearsal', '08:30', 1),
  ('0de00008-0000-4000-8000-000000000102', '0de00006-0000-4000-8000-000000000001', 'Service',   '10:00', 2),
  ('0de00008-0000-4000-8000-000000000201', '0de00006-0000-4000-8000-000000000002', 'Rehearsal', '08:30', 1),
  ('0de00008-0000-4000-8000-000000000202', '0de00006-0000-4000-8000-000000000002', 'Service',   '10:00', 2),
  ('0de00008-0000-4000-8000-000000000301', '0de00006-0000-4000-8000-000000000003', 'Rehearsal', '08:30', 1),
  ('0de00008-0000-4000-8000-000000000302', '0de00006-0000-4000-8000-000000000003', 'Service',   '10:00', 2)
on conflict (id) do nothing;

-- Order of service for the coming Sunday.
insert into public.plan_items
  (id, plan_id, sort_order, kind, title, length_seconds, description, arrangement_id)
select
  v.id::uuid,
  '0de00006-0000-4000-8000-000000000002',
  v.sort_order,
  v.kind::public.plan_item_kind,
  v.title,
  v.length_seconds,
  v.description,
  (select sas.arrangement_id
     from public.song_arrangement_songs sas
     join public.song_arrangements a on a.id = sas.arrangement_id and a.is_default
    where v.song_id <> '' and sas.song_id = nullif(v.song_id, '')::uuid)
from (values
  ('0de00009-0000-4000-8000-000000000001', 1,  'header', 'Pre-service',               300, 'Doors open, music playing',        ''),
  ('0de00009-0000-4000-8000-000000000002', 2,  'item',   'Welcome',                   180, 'Ava welcomes, notices on screen',  ''),
  ('0de00009-0000-4000-8000-000000000003', 3,  'header', 'Worship',                     0, null,                               ''),
  ('0de00009-0000-4000-8000-000000000004', 4,  'song',   'Holy, Holy, Holy',          270, 'Straight into verse 1, no intro',  '0de00005-0000-4000-8000-000000000004'),
  ('0de00009-0000-4000-8000-000000000005', 5,  'song',   'Amazing Grace',             300, 'Repeat last chorus a cappella',    '0de00005-0000-4000-8000-000000000001'),
  ('0de00009-0000-4000-8000-000000000006', 6,  'item',   'Prayer',                    240, null,                               ''),
  ('0de00009-0000-4000-8000-000000000007', 7,  'song',   'Great Is Thy Faithfulness', 300, null,                               '0de00005-0000-4000-8000-000000000003'),
  ('0de00009-0000-4000-8000-000000000008', 8,  'header', 'Word',                        0, null,                               ''),
  ('0de00009-0000-4000-8000-000000000009', 9,  'item',   'Sermon',                   1800, 'Guest speaker',                    ''),
  ('0de00009-0000-4000-8000-00000000000a', 10, 'song',   'It Is Well With My Soul',   300, 'Response song - band stays up',    '0de00005-0000-4000-8000-000000000005'),
  ('0de00009-0000-4000-8000-00000000000b', 11, 'item',   'Closing & notices',         180, null,                               '')
) as v(id, sort_order, kind, title, length_seconds, description, song_id)
on conflict (id) do nothing;

-- Rosters --------------------------------------------------------------------
-- Coming Sunday: everyone confirmed. Following Sunday (draft): a few pending.
insert into public.plan_assignments
  (id, plan_id, person_id, team_id, position_id, status, responded_at)
select
  v.id::uuid,
  v.plan_id::uuid,
  v.person_id::uuid,
  p.team_id,
  v.position_id::uuid,
  v.status::public.assignment_status,
  case when v.status = 'confirmed' then now() - interval '3 days' end
from (values
  -- Coming Sunday - Worship
  ('0de0000a-0000-4000-8000-000000000201', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000001', '0de00003-0000-4000-8000-000000000001', 'confirmed'),
  ('0de0000a-0000-4000-8000-000000000202', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000007', '0de00003-0000-4000-8000-000000000002', 'confirmed'),
  ('0de0000a-0000-4000-8000-000000000203', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000002', '0de00003-0000-4000-8000-000000000004', 'confirmed'),
  ('0de0000a-0000-4000-8000-000000000204', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000003', '0de00003-0000-4000-8000-000000000005', 'confirmed'),
  ('0de0000a-0000-4000-8000-000000000205', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000004', '0de00003-0000-4000-8000-000000000006', 'confirmed'),
  ('0de0000a-0000-4000-8000-000000000206', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000005', '0de00003-0000-4000-8000-000000000007', 'confirmed'),
  ('0de0000a-0000-4000-8000-000000000207', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-00000000000d', '0de00003-0000-4000-8000-000000000007', 'confirmed'),
  -- Coming Sunday - Media & Hospitality
  ('0de0000a-0000-4000-8000-000000000208', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000008', '0de00003-0000-4000-8000-000000000008', 'confirmed'),
  ('0de0000a-0000-4000-8000-000000000209', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-000000000009', '0de00003-0000-4000-8000-000000000009', 'confirmed'),
  ('0de0000a-0000-4000-8000-00000000020a', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-00000000000b', '0de00003-0000-4000-8000-00000000000b', 'confirmed'),
  ('0de0000a-0000-4000-8000-00000000020b', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-00000000000c', '0de00003-0000-4000-8000-00000000000b', 'confirmed'),
  ('0de0000a-0000-4000-8000-00000000020c', '0de00006-0000-4000-8000-000000000002', '0de00001-0000-4000-8000-00000000000f', '0de00003-0000-4000-8000-00000000000c', 'confirmed'),
  -- Last Sunday (history: feeds "last played" and fairness counts)
  ('0de0000a-0000-4000-8000-000000000101', '0de00006-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000007', '0de00003-0000-4000-8000-000000000001', 'confirmed'),
  ('0de0000a-0000-4000-8000-000000000102', '0de00006-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000006', '0de00003-0000-4000-8000-000000000006', 'confirmed'),
  ('0de0000a-0000-4000-8000-000000000103', '0de00006-0000-4000-8000-000000000001', '0de00001-0000-4000-8000-000000000003', '0de00003-0000-4000-8000-000000000007', 'confirmed'),
  -- Following Sunday (draft) - requests not answered yet
  ('0de0000a-0000-4000-8000-000000000301', '0de00006-0000-4000-8000-000000000003', '0de00001-0000-4000-8000-000000000001', '0de00003-0000-4000-8000-000000000001', 'pending'),
  ('0de0000a-0000-4000-8000-000000000302', '0de00006-0000-4000-8000-000000000003', '0de00001-0000-4000-8000-000000000006', '0de00003-0000-4000-8000-000000000006', 'pending'),
  ('0de0000a-0000-4000-8000-000000000303', '0de00006-0000-4000-8000-000000000003', '0de00001-0000-4000-8000-000000000008', '0de00003-0000-4000-8000-000000000008', 'pending')
) as v(id, plan_id, person_id, position_id, status)
join public.positions p on p.id = v.position_id::uuid
on conflict (id) do nothing;

commit;

do $$
begin
  raise notice 'Demo data loaded. Remove it any time with supabase/seeds/demo-wipe.sql';
end $$;
