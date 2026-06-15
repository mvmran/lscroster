-- Migration 0015 — Publish overrides (issue #34, scheduling rules P2)
-- The publish gate runs the shared validateService() check before a plan goes
-- live. When a leader publishes despite a rule violation, we record the override
-- here for audit: which rule, who, why. Errors require a typed reason; warnings
-- may carry one. This is the only schema P2 needs — the validator's history
-- queries reuse the existing `plan_assignments_person_idx (person_id)`.

create table public.publish_overrides (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans (id) on delete cascade,
  rule_code  text not null,                 -- a code from the validator taxonomy
  severity   text not null                  -- 'error' | 'warning'
             check (severity in ('error', 'warning')),
  message    text not null,                 -- the human-readable violation text
  reason     text,                          -- required for errors, optional for warnings
  overridden_by uuid references public.people (id) on delete set null
                default public.current_person_id(),
  created_at timestamptz not null default now()
);

create index publish_overrides_plan_idx on public.publish_overrides (plan_id);

-- RLS: everyone signed in can read the audit trail; admins/leaders write it
-- (matches the rest of the scheduling schema).
alter table public.publish_overrides enable row level security;

create policy "Authenticated can view publish overrides"
  on public.publish_overrides for select to authenticated using (true);

create policy "Leaders record publish overrides"
  on public.publish_overrides for all to authenticated
  using (public.is_admin_or_leader()) with check (public.is_admin_or_leader());
