export type DataStoreProvider = "local" | "supabase";

export function requestedDataStoreProvider(): DataStoreProvider {
  return process.env.DATA_STORE_PROVIDER === "supabase" ? "supabase" : "local";
}

export function supabasePublicConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      ""
  };
}

export function supabaseAdminConfig() {
  return {
    ...supabasePublicConfig(),
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      "",
    importsBucket: process.env.SUPABASE_STORAGE_BUCKET_IMPORTS?.trim() || "imports"
  };
}

export function isSupabasePublicConfigured() {
  const config = supabasePublicConfig();
  return Boolean(config.url && config.anonKey);
}

export function isSupabaseAdminConfigured() {
  const config = supabaseAdminConfig();
  return Boolean(config.url && config.serviceRoleKey);
}

export function resolvedDataStoreProvider(): DataStoreProvider {
  if (requestedDataStoreProvider() !== "supabase") return "local";
  return isSupabaseAdminConfigured() ? "supabase" : "local";
}

export function dataStoreStatus() {
  const adminConfig = supabaseAdminConfig();

  return {
    requestedProvider: requestedDataStoreProvider(),
    activeProvider: resolvedDataStoreProvider(),
    supabaseUrlConfigured: Boolean(adminConfig.url),
    supabaseAnonKeyConfigured: Boolean(adminConfig.anonKey),
    supabaseServiceRoleConfigured: Boolean(adminConfig.serviceRoleKey),
    importsBucket: adminConfig.importsBucket
  };
}
