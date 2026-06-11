import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export interface AuthContextValue {
  session: Session | null
  /** True until the initial session has been restored from storage. */
  loading: boolean
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
