import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdminConfig } from "@/lib/supabase/config";

export function createSupabaseAdminClient(): SupabaseClient | null {
  const config = supabaseAdminConfig();

  if (!config.url || !config.serviceRoleKey) return null;
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
