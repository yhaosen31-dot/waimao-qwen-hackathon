import { NextResponse } from "next/server";
import { searchAggregationService } from "@/services/searchAggregationService";
import { auditSettingsTest, guardSettingsTest } from "@/services/settingsGuardService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await guardSettingsTest(request, "settings.test_search_providers");
  if (limited) return limited;

  const statuses = await searchAggregationService.testProviders();
  await auditSettingsTest(request, "settings.test_search_providers", "success", {
    providers: Object.keys(statuses)
  });

  return NextResponse.json(statuses);
}
