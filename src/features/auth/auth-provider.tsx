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

    supabase.auth.getSession().then(({ data }) => {
      track(data.session)
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      track(newSession)
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [queryClient])

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
