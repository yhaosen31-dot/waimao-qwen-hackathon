import { appLogger, redactForLog } from "@/lib/logger";
import { getRequestContext } from "@/lib/requestContext";
import { saveAuditLogs } from "@/repositories/store";
import type { AuditLog, SaveAuditLogInput } from "@/types";

export interface AuditLogInput {
  action: string;
  resourceType: string;
  resourceId?: string;
  status: AuditLog["status"];
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  actorType?: AuditLog["actorType"];
  actorId?: string;
}

export function auditEnabled() {
  return process.env.SECURITY_AUDIT_LOG_ENABLED !== "false";
}

export async function writeAuditLog(input: SaveAuditLogInput) {
  if (!auditEnabled()) return null;

  try {
    const [log] = await saveAuditLogs([
      {
        ...input,
        metadata: redactForLog(input.metadata ?? {}) as Record<string, unknown>
      }
    ]);
    return log;
  } catch (error) {
    appLogger.warn("audit_log.write_failed", {
      action: input.action,
      resourceType: input.resourceType,
      error: error instanceof Error ? error.message : "Unknown audit log error"
    });
    return null;
  }
}

export async function writeRequestAuditLog(request: Request, input: AuditLogInput) {
  const context = getRequestContext(request);
  return writeAuditLog({
    actorType: input.actorType ?? context.actorType,
    actorId: input.actorId ?? context.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    status: input.status,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    requestId: context.requestId,
    metadata: input.metadata,
    errorMessage: input.errorMessage
  });
}

