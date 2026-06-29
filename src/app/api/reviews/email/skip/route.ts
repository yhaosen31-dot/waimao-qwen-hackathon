import { NextResponse } from "next/server";
import { z } from "zod";
import { applyEmailDraftDecision } from "@/lib/review-service";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";

const schema = z.object({
  draftId: z.string().min(1)
});

export async function POST(request: Request) {
  const rateLimited = await requireRateLimit(request, "review_action");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "review.email_skip",
      resourceType: "email_draft",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const payload = schema.parse(await request.json());

  try {
    const results = await applyEmailDraftDecision({
      draftId: payload.draftId,
      action: "skip"
    });
    await writeRequestAuditLog(request, {
      action: "review.email_skip",
      resourceType: "email_draft",
      resourceId: payload.draftId,
      status: "success"
    });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email skip failed";
    await writeRequestAuditLog(request, {
      action: "review.email_skip",
      resourceType: "email_draft",
      resourceId: payload.draftId,
      status: "failure",
      errorMessage: message
    });
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}

