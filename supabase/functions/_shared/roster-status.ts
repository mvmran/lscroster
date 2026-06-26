// "Upcoming roster status" digest (issue #117). Gathers rostering progress for
// the upcoming N weeks and emails a per-recipient summary to Team Leaders, Team
// Viewers and admins (a plain `leader` only qualifies if also a TL/TV). Each
// recipient's table is scoped to the teams they oversee; admins see every team.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { fetchEmailPrefs, prefAllows, resolveRecipient } from './email-prefs.ts'
import { logEmail } from './email-log.ts'
import {
  rosterStatusEmail,
  type RosterStatusRow,
} from './email-templates/roster-status.ts'
import { sendEmailBatch } from './resend.ts'
import { addDaysISO, appUrl } from './scheduling.ts'

interface ChurchForRoster {
  name: string
  email_from_name: string | null
  timezone: string
  roster_status_weeks: number
}

interface PlanRow {
  id: string
  date: string
  service_type_id: string
}
interface TeamRow {
  id: string
  service_type_teams: { service_type_id: string }[]
  positions: { id: string; min_count: number }[]
}
interface AssignmentRow {
  plan_id: string
  team_id: string
  position_id: string | null
  status: 'pending' | 'confirmed' | 'declined'
  notified_at: string | null
}
interface PersonRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  status: string
  managed_by_person_id: string | null
  role: 'admin' | 'leader' | 'member'
}

/** Whole days between two 'yyyy-mm-dd' wall dates. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  )
}

/** A team serves a plan when it has no explicit service-type links (serves all)
 * or it's linked to this plan's service type — mirrors teamServesType() / the
 * leads_team_on_plan() SQL helper. */
function teamServesType(team: TeamRow, serviceTypeId: string): boolean {
  return (
    team.service_type_teams.length === 0 ||
    team.service_type_teams.some((st) => st.service_type_id === serviceTypeId)
  )
}

/**
 * Builds and sends the roster-status digest. Returns how many emails went out.
 * Safe to call when disabled (`roster_status_weeks === 0`) — it returns early.
 */
export async function runRosterStatus(
  admin: SupabaseClient,
  church: ChurchForRoster,
  today: string,
): Promise<number> {
  const weeks = church.roster_status_weeks
  if (weeks <= 0) return 0

  const end = addDaysISO(today, weeks * 7)
  const fromName = church.email_from_name ?? church.name

  const { data: plansData } = await admin
    .from('plans')
    .select('id, date, service_type_id')
    .gte('date', today)
    .lte('date', end)
    .order('date')
  const plans = (plansData ?? []) as PlanRow[]
  if (plans.length === 0) return 0
  const planIds = plans.map((p) => p.id)

  const [teamsRes, overridesRes, assignmentsRes, leadersRes, viewersRes] =
    await Promise.all([
      admin.from('teams').select('id, service_type_teams(service_type_id), positions(id, min_count)'),
      admin
        .from('plan_position_min_counts')
        .select('plan_id, position_id, min_count')
        .in('plan_id', planIds),
      admin
        .from('plan_assignments')
        .select('plan_id, team_id, position_id, status, notified_at')
        .in('plan_id', planIds),
      admin.from('team_leaders').select('person_id, team_id'),
      admin.from('team_viewers').select('person_id, team_id'),
    ])

  const teams = (teamsRes.data ?? []) as TeamRow[]
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const allTeamIds = new Set(teams.map((t) => t.id))
  const assignments = (assignmentsRes.data ?? []) as AssignmentRow[]

  // Effective min_count per (plan, position): the override if present, else the
  // team-wide positions.min_count (issue #110).
  const overrideByKey = new Map<string, number>()
  for (const o of overridesRes.data ?? []) {
    overrideByKey.set(`${o.plan_id}:${o.position_id}`, o.min_count as number)
  }

  // Per-person team scope from the grant tables.
  const teamsByPerson = new Map<string, Set<string>>()
  const addGrant = (rows: { person_id: string; team_id: string }[]) => {
    for (const r of rows) {
      const set = teamsByPerson.get(r.person_id) ?? new Set<string>()
      set.add(r.team_id)
      teamsByPerson.set(r.person_id, set)
    }
  }
  addGrant((leadersRes.data ?? []) as { person_id: string; team_id: string }[])
  addGrant((viewersRes.data ?? []) as { person_id: string; team_id: string }[])

  // Recipients: every admin (all teams) plus every TL/TV (their granted teams).
  const grantPersonIds = [...teamsByPerson.keys()]
  const { data: adminsData } = await admin
    .from('people')
    .select('id, first_name, last_name, email, status, managed_by_person_id, role')
    .eq('role', 'admin')
    .eq('status', 'active')
  const admins = (adminsData ?? []) as PersonRow[]

  let grantPeople: PersonRow[] = []
  if (grantPersonIds.length > 0) {
    const { data } = await admin
      .from('people')
      .select('id, first_name, last_name, email, status, managed_by_person_id, role')
      .in('id', grantPersonIds)
      .eq('status', 'active')
    grantPeople = (data ?? []) as PersonRow[]
  }

  // Dedup by person; admins get the all-teams scope regardless of any grants.
  const recipients = new Map<string, { person: PersonRow; isAdmin: boolean }>()
  for (const p of admins) recipients.set(p.id, { person: p, isAdmin: true })
  for (const p of grantPeople) {
    if (!recipients.has(p.id)) recipients.set(p.id, { person: p, isAdmin: false })
  }
  if (recipients.size === 0) return 0

  const prefs = await fetchEmailPrefs(admin, [...recipients.keys()])

  interface Outbound {
    to: string
    subject: string
    html: string
    personId: string
  }
  const outbound: Outbound[] = []

  for (const { person, isAdmin } of recipients.values()) {
    if (!prefAllows(prefs, person.id, 'roster_status_emails')) continue
    const scope = isAdmin ? allTeamIds : teamsByPerson.get(person.id) ?? new Set()
    if (scope.size === 0) continue

    const byDate = new Map<string, RosterStatusRow>()
    const rowFor = (date: string): RosterStatusRow => {
      let row = byDate.get(date)
      if (!row) {
        row = {
          date,
          daysUntil: daysBetween(today, date),
          unassigned: 0,
          unsent: 0,
          unconfirmed: 0,
          declined: 0,
          confirmed: 0,
        }
        byDate.set(date, row)
      }
      return row
    }

    for (const plan of plans) {
      const servingTeams = [...scope]
        .map((id) => teamById.get(id))
        .filter((t): t is TeamRow => !!t && teamServesType(t, plan.service_type_id))
      if (servingTeams.length === 0) continue

      const row = rowFor(plan.date)
      const planAssignments = assignments.filter(
        (a) => a.plan_id === plan.id && scope.has(a.team_id),
      )

      // (a) Unassigned = unfilled required slots across the serving teams'
      // positions. A non-declined assignment fills a slot.
      for (const team of servingTeams) {
        for (const pos of team.positions) {
          const effMin =
            overrideByKey.get(`${plan.id}:${pos.id}`) ?? pos.min_count
          const filled = planAssignments.filter(
            (a) => a.position_id === pos.id && a.status !== 'declined',
          ).length
          row.unassigned += Math.max(0, effMin - filled)
        }
      }

      // (b)–(e) from the assignment statuses.
      for (const a of planAssignments) {
        if (a.status === 'confirmed') row.confirmed += 1
        else if (a.status === 'declined') row.declined += 1
        else if (a.notified_at) row.unconfirmed += 1
        else row.unsent += 1
      }
    }

    const rows = [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date))
    const grandTotal = rows.reduce(
      (s, r) =>
        s + r.unassigned + r.unsent + r.unconfirmed + r.declined + r.confirmed,
      0,
    )
    if (rows.length === 0 || grandTotal === 0) continue

    const recipient = await resolveRecipient(admin, person)
    if (!recipient) continue

    const { subject, html } = rosterStatusEmail({
      churchName: church.name,
      recipientName: recipient.recipientName,
      onBehalfOf: recipient.onBehalfOf,
      weeks,
      rows,
      appUrl: appUrl(),
    })
    outbound.push({ to: recipient.email, subject, html, personId: person.id })
  }

  if (outbound.length === 0) return 0

  const results = await sendEmailBatch(
    outbound.map((o) => ({ to: o.to, subject: o.subject, html: o.html, fromName })),
  )
  await Promise.all(
    outbound.map((o, idx) =>
      logEmail(admin, {
        to: o.to,
        template: 'roster-status',
        subject: o.subject,
        result: results[idx],
        personId: o.personId,
        planId: null,
      }),
    ),
  )
  return results.filter((r) => r.sent).length
}
