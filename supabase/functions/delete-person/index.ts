// Hard-deletes a person AND their auth account (if linked). Client-side
// deletes can't touch auth.users, which would leave an orphaned login able
// to sign in — so deletion goes through this admin-only function.

import { z } from 'npm:zod@4'
import { getCallerPerson, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const schema = z.object({ personId: z.uuid() })

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
    return jsonResponse({ error: 'Only admins can delete people' }, 403)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonResponse({ error: 'Invalid request' }, 400)
  const { personId } = parsed.data

  if (personId === caller.id) {
    return jsonResponse({ error: 'You cannot delete yourself' }, 400)
  }

  const { data: person } = await admin
    .from('people')
    .select('id, auth_user_id, photo_url')
    .eq('id', personId)
    .maybeSingle()
  if (!person) return jsonResponse({ error: 'Person not found' }, 404)

  // Delete the auth account first: its FK sets people.auth_user_id to null,
  // so a failure here leaves everything intact.
  if (person.auth_user_id) {
    const { error } = await admin.auth.admin.deleteUser(person.auth_user_id)
    if (error) {
      console.error('deleteUser failed:', error)
      return jsonResponse({ error: 'Failed to remove sign-in access' }, 500)
    }
  }

  if (person.photo_url) {
    await admin.storage.from('photos').remove([person.photo_url])
  }

  // Attribute the audit-log deletion event to this admin (issue #116).
  const { error: deleteError } = await serviceClient(caller.id)
    .from('people')
    .delete()
    .eq('id', personId)
  if (deleteError) {
    console.error('person delete failed:', deleteError)
    return jsonResponse({ error: 'Failed to delete person' }, 500)
  }

  return jsonResponse({ ok: true })
})
