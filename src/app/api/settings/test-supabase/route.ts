import { NextResponse } from "next/server";
import { testSupabaseStoreConnection } from "@/repositories/supabaseStore";
import { auditSettingsTest, guardSettingsTest } from "@/services/settingsGuardService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await guardSettingsTest(request, "settings.test_supabase");
  if (limited) return limited;

  const result = await testSupabaseStoreConnection();
  await auditSettingsTest(request, "settings.test_supabase", result.ok ? "success" : "failure", {
    provider: result.provider,
    databaseConnected: result.databaseConnected,
    storageBucketExists: result.storageBucketExists
  }, result.error ?? result.storageError);
  return NextResponse.json(result);
}
