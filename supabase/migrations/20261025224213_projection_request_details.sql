-- Migration 0072 — Why a projection API request failed. Re-runnable.
--
-- projection_api_requests (0036) already holds a row for every answer the
-- projection-api function gives, refusals included, but a 401 row said nothing
-- about why: no key, a mistyped one and a revoked one all looked the same, and a
-- 404 didn't say whether the plan was missing, unpublished or out of the window.
-- Each row now records:
--   reason      what happened, as a code ('revoked_key', 'plan_not_published' …)
--               — the response's own `error` stays as documented, this is for
--               the church's admins only;
--   key_prefix  the first characters of a key nobody recognises ('lscp_a1b2c3'),
--               the same display prefix projection_api_keys keeps for real ones,
--               so a mistyped key can be told apart — never the key or its hash;
--   method, path, user_agent  what was asked for and by what;
--   detail      a short error message for a server-side failure.
-- A revoked key's requests carry its key_id, so the log names the device still
-- calling. Rows from before this migration have none of it.
--
-- Old rows are pruned by the hourly reminders job: failures after 90 days,
-- successful requests (the CCLI usage trail) after a year.
--
-- The table-wide grants (0050) and the admins-read RLS policy cover the new
-- columns.

alter table public.projection_api_requests
  add column if not exists reason text
    check (reason is null or reason ~ '^[a-z_]{1,40}$'),
  add column if not exists key_prefix text
    check (key_prefix is null or char_length(key_prefix) <= 11),
  add column if not exists method text
    check (method is null or char_length(method) <= 10),
  add column if not exists path text
    check (path is null or char_length(path) <= 200),
  add column if not exists user_agent text
    check (user_agent is null or char_length(user_agent) <= 300),
  add column if not exists detail text
    check (detail is null or char_length(detail) <= 300);

comment on column public.projection_api_requests.reason is
  'Why the request got its answer: ok, missing_key, malformed_key, unknown_key, revoked_key, rate_limited, method_not_allowed, not_found, plan_not_found, plan_not_published, plan_outside_window, database_error, internal_error. Null on rows from before 0072.';
comment on column public.projection_api_requests.key_prefix is
  'First 11 characters of a key that matched no projection_api_keys row. Never the key or its hash.';

-- The log page reads newest first and pruning cuts by age.
create index if not exists projection_api_requests_time_idx
  on public.projection_api_requests (requested_at desc);

-- The per-IP cap on logged refusals counts an IP's recent 401s.
create index if not exists projection_api_requests_refused_ip_idx
  on public.projection_api_requests (ip, requested_at desc)
  where http_status = 401;
