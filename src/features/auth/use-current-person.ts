import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/use-auth'
import { supabase } from '@/lib/supabase'

/** The signed-in user's own `people` record (RLS allows reading own row). */
export function useCurrentPerson() {
  const { session } = useAuth()
  const userId = session?.user.id

  return useQuery({
    queryKey: ['current-person', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .eq('auth_user_id', userId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
