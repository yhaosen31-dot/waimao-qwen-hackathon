import { NextResponse } from "next/server";
import { testRedisConnection } from "@/queue/redis";
import { auditSettingsTest, guardSettingsTest } from "@/services/settingsGuardService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await guardSettingsTest(request, "settings.test_redis");
  if (limited) return limited;

  const result = await testRedisConnection();
  await auditSettingsTest(request, "settings.test_redis", "success", {
    queueEnabled: result.queueEnabled,
    redisConnected: result.redisConnected
  });
  return NextResponse.json(result);
}
