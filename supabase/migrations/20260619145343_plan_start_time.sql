-- Per-plan start-time override.
--
-- Until now every plan inherited its start time from the service type
-- (service_types.default_start_time). That breaks down when one service type
-- has two plans on the same day at different times — e.g. a one-off extra
-- Sunday evening service. These nullable columns let a single plan (and a
-- template) carry its own start time; when null they inherit the service
-- type's default, so existing plans and instances are unchanged and the
-- migration stays re-runnable on a fresh database.

alter table public.plans add column if not exists start_time time;
alter table public.plan_templates add column if not exists start_time time;

comment on column public.plans.start_time is
  'Optional per-plan start time. When null, inherits service_types.default_start_time.';
comment on column public.plan_templates.start_time is
  'Optional template start time, carried onto plans created from it. When null, inherits the service type default.';
