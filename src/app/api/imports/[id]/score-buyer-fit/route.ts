import { NextResponse } from "next/server";
import { addLeadJob } from "@/queue/leadQueue";
import { getImportJobResults } from "@/repositories/store";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { scoreImportJobBuyerFit } from "@/services/buyerFitScoringService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: Request, context: Context) {
  const rateLimited = await requireRateLimit(request, "buyer_fit_scoring");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "buyer_fit.score",
      resourceType: "import_job",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { limit?: number } | null;
  const limit =
    typeof body?.limit === "number" && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(10, Math.floor(body.limit)))
      : 2;
  const results = await getImportJobResults(id);

  if (!results) {
    return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  }

  const runId = results.importJob.runId ?? results.companies[0]?.runId;
  if (!runId) {
    return NextResponse.json(
      { error: "Please confirm this import before starting Buyer Fit scoring." },
      { status: 400 }
    );
  }

  const queueResult = await addLeadJob({
    type: "buyer_fit_scoring",
    runId,
    importJobId: id,
    source: "excel_import",
    options: {
      limit
    }
  });

  if (queueResult.queued) {
    await writeRequestAuditLog(request, {
      action: "buyer_fit.score",
      resourceType: "import_job",
      resourceId: id,
      status: "success",
      metadata: { mode: "queue", runId, jobId: queueResult.jobId, limit }
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      mode: queueResult.mode,
      runId,
      jobId: queueResult.jobId,
      message: "Buyer Fit scoring has been queued and will continue in the worker."
    });
  }

  const stats = await scoreImportJobBuyerFit(id, { limit });

  await writeRequestAuditLog(request, {
    action: "buyer_fit.score",
    resourceType: "import_job",
    resourceId: id,
    status: "success",
    metadata: {
      mode: queueResult.mode,
      fallbackReason: queueResult.reason,
      runId,
      scored: stats.scored,
      remaining: stats.remaining
    }
  });

  return NextResponse.json({
    ok: true,
    queued: false,
    mode: queueResult.mode,
    queueFallbackReason: queueResult.reason,
    message:
      stats.remaining > 0
        ? `Buyer Fit scored ${stats.scored}/${stats.total}; ${stats.remaining} remaining.`
        : `Buyer Fit scoring completed for ${stats.scored}/${stats.total} companies.`,
    stats
  });
}
