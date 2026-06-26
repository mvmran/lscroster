-- Migration 0028 — Upcoming roster status emails (issue #117)
-- A nightly digest (8pm church time, via the existing hourly reminders cron) of
-- rostering progress for upcoming services, sent to Team Leaders, Team Viewers
-- and admins. Two new settings:
--   * church_settings.roster_status_weeks — how many weeks ahead the digest
--     looks. 0 disables the job entirely (the default, so existing instances
--     don't start emailing on upgrade); up to 52.
--   * person_email_prefs.roster_status_emails — the per-person opt-out, on by
--     default like every other email preference.

alter table public.church_settings
  add column roster_status_weeks integer not null default 0
    check (roster_status_weeks between 0 and 52);

alter table public.person_email_prefs
  add column roster_status_emails boolean not null default true;
