// Caller identification for Edge Functions: resolves the Authorization header
// to the caller's `people` row (or null).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

export interface CallerPerson {
  id: string
  first_name: string
  last_name: string
  email: string | null
  role: 'admin' | 'leader' | 'member'
}

export async function getCallerPerson(
  req: Request,
  admin: SupabaseClient,
): Promise<CallerPerson | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  )
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return null

  const { data: person } = await admin
    .from('people')
    .select('id, first_name, last_name, email, role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return (person as CallerPerson | null) ?? null
}
