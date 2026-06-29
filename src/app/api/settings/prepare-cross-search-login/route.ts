import { NextResponse } from "next/server";
import { auditSettingsTest, guardSettingsTest } from "@/services/settingsGuardService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await guardSettingsTest(request, "settings.prepare_cross_search_login");
  if (limited) return limited;

  await auditSettingsTest(request, "settings.prepare_cross_search_login", "success", {
    enabled: false,
    mode: "disabled"
  });

  return NextResponse.json({
    enabled: false,
    mode: "disabled",
    ok: true,
    success: false,
    loggedIn: false,
    requiresHuman: false,
    message:
      "Cross search connector is disabled because account risk control was detected. No browser will be opened."
  });
}
