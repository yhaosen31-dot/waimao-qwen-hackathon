import { nanoid } from "nanoid";

export interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  actorType: "anonymous" | "user" | "system" | "worker";
  actorId?: string;
}

export function getRequestContext(request: Request): RequestContext {
  const headers = request.headers;
  const requestId =
    headers.get("x-request-id") ??
    headers.get("x-correlation-id") ??
    `req_${nanoid(12)}`;
  const ipAddress =
    firstForwardedIp(headers.get("x-forwarded-for")) ??
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    undefined;
  const userAgent = headers.get("user-agent") ?? undefined;
  const actorId = headers.get("x-waimao-user-id") ?? undefined;

  return {
    requestId,
    ipAddress,
    userAgent,
    actorType: actorId ? "user" : "anonymous",
    actorId
  };
}

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || undefined;
}
