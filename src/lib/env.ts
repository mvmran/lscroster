import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url({
    error: 'VITE_SUPABASE_URL must be a valid URL (see .env.example)',
  }),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, {
    error: 'VITE_SUPABASE_ANON_KEY is required (see .env.example)',
  }),
})

export const env = envSchema.parse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
})
