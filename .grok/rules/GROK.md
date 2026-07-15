# GROK.md — LSCroster (project rules)

This file is placed in `.grok/rules/` so it is always discovered and loaded by Grok for this project (every *.md in the rules dir is loaded).

See the root `GROK.md` (and `CLAUDE.md`) for the full detailed instructions. Key points are repeated here for emphasis in the rules loader.

## Critical standing instructions

- Follow `PHASES.md` strictly. Work only on open GitHub issues or the current phase. Tick checkboxes. Do not start Phase 5 (distribution) without Manoj's confirmation.
- Single-tenant architecture: NO `tenant_id`, no multi-tenancy ever.
- All schema via timestamped migrations only + types + RLS.
- Tech stack is locked (see full table in root GROK.md / CLAUDE.md).
- Verify locally with `npx supabase db reset --local` before any production push.
- Use todo_write for tasks with 3+ steps.
- Conventional commits; run build + typecheck (and test) before pushing.
- Mobile-first, strict TS, Zod validation, minimal deps.

## Working rules (abridged)

1. PHASES.md first (Post-Phase-4 section + open issues).
2. Never destructive ops on linked prod DB without explicit confirmation.
3. Migration + types + RLS together.
4. Strict TypeScript, no `any`.
5. Mobile-first UX.
6. Keep deps minimal.
7. Small conventional commits; checks must pass.
8. Upgrade-safe changes need migration notes.
9. Fast, obvious, Sunday-morning-proof UI.
10. Local stack verification + RLS probes before deploy.
11. Use structured todo tracking for complex work.
12. Enter plan mode on genuinely ambiguous architecture work.

Full details (repository layout, database rules, auth flow, commands, gotchas, local verification steps, etc.) are in the root `GROK.md` and `CLAUDE.md` — read them at the start of any session if context is limited.

## Reference

- **Current status (2026-07-15):** Phases 0–4 deployed. Phase 5 not started. Work is issue-driven (`mvmran/lscroster`).
- Schema through ~0038 (`conditional_rule_person_effects`); 37 migration files. See root `GROK.md` "Current state" for recently shipped features and open backlog snapshot.
- Post-Phase-4 enhancements, upgrade notes, and local-stack gotchas are in `PHASES.md` — always cross-check the latest content there.
