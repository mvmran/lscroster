-- Migration 0010 — Church postal address (issue #17)
-- Plan-publish notification emails include the church's name and address, so
-- recipients know where to turn up. The address is a single free-text block
-- (multi-line), editable by admins from Settings → Church.

alter table public.church_settings
  add column address text;
