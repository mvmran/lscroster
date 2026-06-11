// First-run setup: creates the church_settings row and the first admin
// account. Only callable while the instance is completely unconfigured
// (no church_settings row and no people), so it is safe to expose without
// a JWT (verify_jwt = false in config.toml). Public signups stay disabled;
// this is the only self-service account-creation path, and it works exactly
// once per instance.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const setupSchema = z.object({
  churchName: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email(),
  password: z.string().min(8).max(200),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const parsed = setupSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonResponse(
      { error: 'Invalid request', details: z.flattenError(parsed.error).fieldErrors },
      400,
    )
  }
  const { churchName, timezone, firstName, lastName, email, password } =
    parsed.data

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const [settings, people] = await Promise.all([
    admin.from('church_settings').select('id', { count: 'exact', head: true }),
    admin.from('people').select('id', { count: 'exact', head: true }),
  ])
  if (settings.error || people.error) {
    return jsonResponse({ error: 'Failed to check setup state' }, 500)
  }
  if ((settings.count ?? 0) > 0 || (people.count ?? 0) > 0) {
    return jsonResponse({ error: 'This instance is already set up' }, 403)
  }

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
  if (userError || !userData.user) {
    return jsonResponse(
      { error: userError?.message ?? 'Failed to create admin user' },
      500,
    )
  }

  const { error: insertError } = await admin.from('people').insert({
    first_name: firstName,
    last_name: lastName,
    email,
    role: 'admin',
    auth_user_id: userData.user.id,
  })
  if (insertError) {
    await admin.auth.admin.deleteUser(userData.user.id)
    return jsonResponse({ error: 'Failed to create admin person record' }, 500)
  }

  const { error: churchError } = await admin.from('church_settings').insert({
    name: churchName,
    timezone,
  })
  if (churchError) {
    await admin.from('people').delete().eq('auth_user_id', userData.user.id)
    await admin.auth.admin.deleteUser(userData.user.id)
    return jsonResponse({ error: 'Failed to create church settings' }, 500)
  }

  return jsonResponse({ ok: true })
})
