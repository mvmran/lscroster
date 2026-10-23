import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * The request may or may not have done its work: no answer came back (a
 * dropped connection), or a gateway error arrived without a reply from the
 * function. A caller that would repeat a send must not report it as failed.
 */
export class UnconfirmedError extends Error {}

/**
 * Invokes a Supabase Edge Function and normalises errors so callers always
 * get a plain Error with the server-provided message when available.
 */
export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context
        .json()
        .catch(() => null) as { error?: string } | null
      if (detail?.error) throw new Error(detail.error)
      // A 5xx with no message of ours came from the gateway, not the function.
      if (error.context.status >= 500) {
        throw new UnconfirmedError('The server didn’t confirm it. Please check before trying again.')
      }
      throw new Error('Request failed')
    }
    throw new UnconfirmedError('Could not reach the server. Please try again.')
  }
  if (data === null) {
    throw new Error('Empty response from server')
  }
  return data
}
