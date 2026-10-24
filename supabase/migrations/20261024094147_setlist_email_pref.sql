-- Migration 0071 — A "Worship set list" email preference. Re-runnable.
--
-- The set list went to its distribution list without asking anyone's
-- preferences. It now has its own box on the Email preferences card, on by
-- default like every other, so existing people keep receiving it; switching it
-- off takes a person off the send even while they are on the list. Who is on
-- the list doesn't change. The sending is in send-setlist; nothing else here
-- changes. (Admins' copies of published plans, added alongside, use the
-- existing publish_emails box.)
--
-- The table-wide grants on person_email_prefs (0050) and its RLS policies cover
-- the new column.

alter table public.person_email_prefs
  add column if not exists setlist_emails boolean not null default true;
