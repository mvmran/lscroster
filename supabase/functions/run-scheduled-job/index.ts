// Admin-only "send now" trigger for the scheduled email jobs (issue #117).
// The recurring jobs live in the `reminders` function (run hourly by pg_cron);
// this thin function lets an admin fire one immediately from Settings →
// Scheduled jobs. It invokes `reminders` with the shared cron secret and
// `{ force: true, only: <job> }`, in the background, so the click returns at
// once while the emails go out.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const schema = z.object({
  job: z.enum(['nudge', 'reminder', 'roster-status']),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const admin = serviceClient()
  const caller = await getCallerPerson(req, admin)
  if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401)
  if (caller.role !== 'admin') {
    return jsonResponse({ error: 'Only admins can run scheduled jobs' }, 403)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const { job } = parsed.data

  const secret = Deno.env.get('CRON_SECRET')
  const baseUrl = Deno.env.get('SUPABASE_URL')
  if (!secret || !baseUrl) {
    return jsonResponse({ error: 'Scheduled jobs are not configured' }, 503)
  }

  // Fire the reminders function in the background and return immediately so the
  // admin isn't held while emails send. Failures surface in the email log.
  const work = fetch(`${baseUrl}/functions/v1/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify({ force: true, only: job }),
  }).catch((e) => console.error('run-scheduled-job dispatch failed:', e))

  // EdgeRuntime.waitUntil keeps the isolate alive for the background fetch.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime
  if (runtime) runtime.waitUntil(work)

  return jsonResponse({ ok: true, started: job })
})
