import { NextResponse } from "next/server";
import { z } from "zod";
import { approveKeywordsForRun } from "@/lib/review-service";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";

const approveKeywordsSchema = z.object({
  keywordIds: z.array(z.string().min(1)).min(1)
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
      action: "review.approve_keywords",
      resourceType: "run",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { runId } = await params;
  const payload = approveKeywordsSchema.parse(await request.json());

  try {
    const results = await approveKeywordsForRun(runId, payload.keywordIds);
    await writeRequestAuditLog(request, {
      action: "review.approve_keywords",
      resourceType: "run",
      resourceId: runId,
      status: "success",
      metadata: {
        keywordCount: payload.keywordIds.length
      }
    });

    return NextResponse.json({
      ok: true,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keyword approval failed";
    const status = message === "Run not found" ? 404 : 400;
    await writeRequestAuditLog(request, {
      action: "review.approve_keywords",
      resourceType: "run",
      resourceId: runId,
      status: "failure",
      metadata: {
        keywordCount: payload.keywordIds.length
      },
      errorMessage: message
    });

    return NextResponse.json({ error: message }, { status });
  }
}

