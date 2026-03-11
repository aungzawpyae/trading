import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

export function useDb(): SupabaseClient {
  if (!_supabase) {
    const config = useRuntimeConfig()
    _supabase = createClient(config.supabaseUrl, config.supabaseKey)
  }
  return _supabase
}
