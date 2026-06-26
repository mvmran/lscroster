import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/use-auth'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

/** The signed-in user's own `people` record (RLS allows reading own row). */
export function useCurrentPerson() {
  const { session } = useAuth()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['current-person', userId],
    enabled: !!userId,
    queryFn: async () => {
      // Read through the masked view (issue #119) — you always see your own
      // contact details, and the base table's contact columns are now locked
      // away from the client roles so `select('*')` there would fail.
      const { data, error } = await supabase
        .from('people_directory')
        .select('*')
        .eq('auth_user_id', userId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as unknown as Tables<'people'> | null
    },
    staleTime: 5 * 60 * 1000,
  })
}
