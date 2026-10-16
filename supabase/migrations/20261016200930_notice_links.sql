-- Migration 0055 — Links on the notice board.
-- A notice was always a PDF in the private `notices` bucket (0049). It can now
-- instead point at a web page — the church wiki, a YouTube video, a sign-up
-- form — held in `link_url`. Exactly one of the two: a PDF notice has
-- `storage_path` and `file_name`, a link notice has `link_url` and neither.
--
-- http(s) only, as everywhere a link is stored (reference recordings, plans'
-- picks): the app only renders an http(s) href, and this keeps any other write
-- path to the same rule. Existing notices are all PDFs and satisfy the check.
--
-- Policies are unchanged (everyone signed in reads; admins and coordinators add
-- and remove), and the table's grants already cover the new column. Re-runnable.

alter table public.notices
  alter column storage_path drop not null,
  alter column file_name drop not null;

alter table public.notices
  add column if not exists link_url text
    check (link_url is null or (link_url ~* '^https?://\S+$' and char_length(link_url) <= 2000));

alter table public.notices drop constraint if exists notices_pdf_or_link;
alter table public.notices
  add constraint notices_pdf_or_link check (
    (storage_path is null) <> (link_url is null)
    and (storage_path is null) = (file_name is null)
  );

comment on column public.notices.link_url is
  'A link notice''s web address (http/https). Null for a PDF notice, which has storage_path and file_name instead.';
