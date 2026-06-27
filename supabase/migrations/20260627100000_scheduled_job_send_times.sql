-- Migration 0030 — Admin-configurable send times for scheduled jobs (issue #120)
-- The nudge, pre-service reminder and roster-status digest jobs each fired at a
-- hard-coded hour (9am / 9am / 8pm church time). Let an admin set the hour for
-- each from Settings → Scheduled jobs. Stored as the local hour-of-day (0–23)
-- in the church timezone; the hourly reminders cron gates each job on its hour.

alter table public.church_settings
  add column nudge_hour         smallint not null default 9
    check (nudge_hour between 0 and 23),
  add column reminder_hour      smallint not null default 9
    check (reminder_hour between 0 and 23),
  add column roster_status_hour smallint not null default 20
    check (roster_status_hour between 0 and 23);
