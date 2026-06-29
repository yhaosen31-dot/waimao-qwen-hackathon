import { NextResponse } from "next/server";
import { auditSettingsTest, guardSettingsTest } from "@/services/settingsGuardService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await guardSettingsTest(request, "settings.test_cross_search");
  if (limited) return limited;

  await auditSettingsTest(request, "settings.test_cross_search", "success", {
    enabled: false,
    mode: "disabled"
  });

  return NextResponse.json({
    enabled: false,
    mode: "disabled",
    ok: true,
    loggedIn: false,
    requiresHuman: false,
    message: "Cross search connector is disabled. Use Excel import or product search instead."
  });
}
