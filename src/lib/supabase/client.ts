"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "@/lib/supabase/config";

export function createSupabaseBrowserClient(): SupabaseClient | null {
  const config = supabasePublicConfig();

  if (!config.url || !config.anonKey) return null;
  return createBrowserClient(config.url, config.anonKey);
}
