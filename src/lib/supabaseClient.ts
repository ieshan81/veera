import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn('VEERA Admin: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(url ?? '', anon ?? '')

/** False on Netlify if env vars were not set at build time. */
export function hasSupabaseConfig(): boolean {
  return Boolean(url?.trim() && anon?.trim())
}
