import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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
      throw new Error(detail?.error ?? 'Request failed')
    }
    throw new Error('Could not reach the server. Please try again.')
  }
  if (data === null) {
    throw new Error('Empty response from server')
  }
  return data
}
