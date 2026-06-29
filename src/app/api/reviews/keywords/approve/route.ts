import { NextResponse } from "next/server";
import { z } from "zod";
import { approveKeywordsForRun } from "@/lib/review-service";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";

const schema = z.object({
  runId: z.string().min(1),
  keywordIds: z.array(z.string().min(1)).min(1)
});

export async function POST(request: Request) {
  const rateLimited = await requireRateLimit(request, "review_action");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "review.approve_keywords",
      resourceType: "run",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const payload = schema.parse(await request.json());

  try {
    const results = await approveKeywordsForRun(payload.runId, payload.keywordIds);
    await writeRequestAuditLog(request, {
      action: "review.approve_keywords",
      resourceType: "run",
      resourceId: payload.runId,
      status: "success",
      metadata: { keywordCount: payload.keywordIds.length }
    });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keyword approval failed";
    await writeRequestAuditLog(request, {
      action: "review.approve_keywords",
      resourceType: "run",
      resourceId: payload.runId,
      status: "failure",
      metadata: { keywordCount: payload.keywordIds.length },
      errorMessage: message
    });
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}

