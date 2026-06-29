import { NextResponse } from "next/server";
import { z } from "zod";
import { applyEmailDraftDecisions } from "@/lib/review-service";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";

const approveEmailSchema = z.object({
  drafts: z
    .array(
      z.object({
        id: z.string().min(1),
        companyId: z.string().min(1),
        subject: z.string().min(1),
        body: z.string().min(1),
        action: z.enum(["approve", "skip", "save_draft"]).default("approve")
      })
    )
    .min(1)
});

interface Params {
  params: Promise<{
    runId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  const rateLimited = await requireRateLimit(request, "review_action");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "review.email_decisions",
      resourceType: "run",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { runId } = await params;
  const payload = approveEmailSchema.parse(await request.json());

  try {
    const results = await applyEmailDraftDecisions(
      runId,
      payload.drafts.map((draft) => ({
        draftId: draft.id,
        subject: draft.subject,
        body: draft.body,
        action: draft.action
      }))
    );
    await writeRequestAuditLog(request, {
      action: "review.email_decisions",
      resourceType: "run",
      resourceId: runId,
      status: "success",
      metadata: {
        draftCount: payload.drafts.length,
        actions: payload.drafts.map((draft) => draft.action)
      }
    });

    return NextResponse.json({
      ok: true,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email review failed";
    const status = message.includes("not found") ? 404 : 400;
    await writeRequestAuditLog(request, {
      action: "review.email_decisions",
      resourceType: "run",
      resourceId: runId,
      status: "failure",
      metadata: {
        draftCount: payload.drafts.length,
        actions: payload.drafts.map((draft) => draft.action)
      },
      errorMessage: message
    });

    return NextResponse.json({ error: message }, { status });
  }
}

