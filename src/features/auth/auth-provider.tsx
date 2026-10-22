import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { AuthContext } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Most query keys (['plans'], people, songs) don't name the user, so when
    // someone else — or nobody — is signed in, drop the cache: on a shared
    // tablet the next person would otherwise see the last one's rows, RLS or
    // not, until each refetch lands. A token refresh keeps the same user and
    // leaves it alone. `undefined` until the first session is known.
    let userId: string | null | undefined
    const track = (next: Session | null) => {
      const nextId = next?.user.id ?? null
      if (userId !== undefined && nextId !== userId) queryClient.clear()
      userId = nextId
    }

    // INITIAL_SESSION brings the starting session, and still fires (with none)
    // when restoring it fails, so loading always ends. A separate getSession()
    // left loading stuck when it rejected, and its late answer could bring back
    // a session another tab had just signed out.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      track(newSession)
      setSession(newSession)
      if (event === 'INITIAL_SESSION') setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [queryClient])

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
