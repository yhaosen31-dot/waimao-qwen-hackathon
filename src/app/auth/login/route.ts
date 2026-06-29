import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureAuthenticatedUserAccess } from "@/services/authService";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await requireRateLimit(request, "auth_login");
  if (limited) return limited;

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(new URL(request.url).searchParams.get("next") ?? undefined);

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    await writeRequestAuditLog(request, {
      action: "auth.login",
      resourceType: "auth",
      status: "failure",
      metadata: { reason: "auth_not_configured", email }
    });
    return redirectWithError(request, "auth_not_configured", next);
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.user) {
    const reason = loginErrorCode(error);
    await writeRequestAuditLog(request, {
      action: "auth.login",
      resourceType: "auth",
      status: "failure",
      metadata: {
        reason,
        email,
        supabaseError: error?.message
      }
    });
    return redirectWithError(request, reason, next);
  }

  const access = await ensureAuthenticatedUserAccess({
    userId: data.user.id,
    email: data.user.email ?? email
  });

  if (!access.ok) {
    await supabase.auth.signOut();
    await writeRequestAuditLog(request, {
      action: "auth.login",
      resourceType: "auth",
      resourceId: data.user.id,
      status: "blocked",
      actorType: "user",
      actorId: data.user.id,
      metadata: { reason: access.reason, email }
    });
    return redirectWithError(request, "not_member", next);
  }

  await writeRequestAuditLog(request, {
    action: "auth.login",
    resourceType: "auth",
    resourceId: data.user.id,
    status: "success",
    actorType: "user",
    actorId: data.user.id,
    metadata: {
      email,
      role: access.role,
      organizationId: access.organizationId,
      bootstrappedOwner: access.bootstrappedOwner
    }
  });

  return NextResponse.redirect(new URL(next, request.url));
}

function redirectWithError(request: Request, error: string, next: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

function safeNext(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/runs/new";
  if (value.startsWith("/login") || value.startsWith("/auth/")) return "/runs/new";
  return value;
}

function loginErrorCode(error: { message?: string; code?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();

  if (text.includes("email not confirmed") || text.includes("not confirmed")) {
    return "email_not_confirmed";
  }
  if (text.includes("too many") || text.includes("rate")) {
    return "too_many_attempts";
  }
  return "invalid_credentials";
}
