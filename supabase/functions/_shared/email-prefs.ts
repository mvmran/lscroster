// Per-person email preferences (issue #87) and managed-account email routing
// (issue #89), shared by every scheduling email function.

import { type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type EmailPrefKey =
  | 'roster_emails'
  | 'nudge_emails'
  | 'reminder_emails'
  | 'publish_emails'

export interface EmailPrefs {
  roster_emails: boolean
  nudge_emails: boolean
  reminder_emails: boolean
  publish_emails: boolean
}

const ALL_ON: EmailPrefs = {
  roster_emails: true,
  nudge_emails: true,
  reminder_emails: true,
  publish_emails: true,
}

/**
 * Email preferences for a set of people. A person with no row has every flag
 * on (the default), so existing people opt into all email automatically.
 */
export async function fetchEmailPrefs(
  admin: SupabaseClient,
  personIds: string[],
): Promise<Map<string, EmailPrefs>> {
  const map = new Map<string, EmailPrefs>()
  const ids = [...new Set(personIds)]
  if (ids.length === 0) return map
  const { data } = await admin
    .from('person_email_prefs')
    .select('person_id, roster_emails, nudge_emails, reminder_emails, publish_emails')
    .in('person_id', ids)
  for (const row of data ?? []) {
    map.set(row.person_id as string, {
      roster_emails: row.roster_emails as boolean,
      nudge_emails: row.nudge_emails as boolean,
      reminder_emails: row.reminder_emails as boolean,
      publish_emails: row.publish_emails as boolean,
    })
  }
  return map
}

/** Whether `personId` allows `key` emails (missing prefs ⇒ allowed). */
export function prefAllows(
  prefs: Map<string, EmailPrefs>,
  personId: string,
  key: EmailPrefKey,
): boolean {
  return (prefs.get(personId) ?? ALL_ON)[key]
}

export interface PersonForRouting {
  id: string
  first_name: string
  last_name: string
  email: string | null
  managed_by_person_id: string | null
}

export interface ResolvedRecipient {
  email: string
  /** First name to greet — the manager's when on behalf, else the person's. */
  recipientName: string
  /** The managed person's full name when routed to a manager, else null. */
  onBehalfOf: string | null
}

/**
 * Where a person's scheduling email should go. Their own address if they have
 * one; otherwise their managing member's address (issue #89) so a parent can
 * answer for a child without an email of their own. Returns null when neither
 * has a usable address.
 */
export async function resolveRecipient(
  admin: SupabaseClient,
  person: PersonForRouting,
): Promise<ResolvedRecipient | null> {
  if (person.email) {
    return { email: person.email, recipientName: person.first_name, onBehalfOf: null }
  }
  if (person.managed_by_person_id) {
    const { data: manager } = await admin
      .from('people')
      .select('first_name, email, status')
      .eq('id', person.managed_by_person_id)
      .maybeSingle()
    if (manager?.email && manager.status === 'active') {
      return {
        email: manager.email as string,
        recipientName: manager.first_name as string,
        onBehalfOf: `${person.first_name} ${person.last_name}`.trim(),
      }
    }
  }
  return null
}
