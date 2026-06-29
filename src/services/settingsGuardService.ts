import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export async function guardSettingsTest(request: Request, action: string) {
  const rateLimited = await requireRateLimit(request, "settings_test");
  if (!rateLimited) return null;

  await writeRequestAuditLog(request, {
    action,
    resourceType: "settings",
    status: "blocked",
    metadata: { reason: "rate_limited" }
  });

  return rateLimited;
}

export async function auditSettingsTest(
  request: Request,
  action: string,
  status: "success" | "failure",
  metadata?: Record<string, unknown>,
  errorMessage?: string
) {
  return writeRequestAuditLog(request, {
    action,
    resourceType: "settings",
    status,
    metadata,
    errorMessage
  });
}

