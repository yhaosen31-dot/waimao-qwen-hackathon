import { NextResponse } from "next/server";
import { addLeadJob } from "@/queue/leadQueue";
import { getImportJobResults } from "@/repositories/store";
import { writeRequestAuditLog } from "@/services/auditLogService";
import {
  enrichImportJobCompanies,
  type ImportJobEnrichmentTarget
} from "@/services/companyEnrichmentService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: Request, context: Context) {
  const rateLimited = await requireRateLimit(request, "import_enrichment");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "import.enrich",
      resourceType: "import_job",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    force?: boolean;
    limit?: number;
    offset?: number;
    target?: string;
  } | null;
  const limit =
    typeof body?.limit === "number" && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(20, Math.floor(body.limit)))
      : 1;
  const target = parseEnrichmentTarget(body?.target);
  const results = await getImportJobResults(id);

  if (!results) {
    return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  }

  if (results.companies.length === 0) {
    return NextResponse.json(
      {
        error:
          "No imported companies were found for this import job. Please click Confirm Import again before enrichment."
      },
      { status: 400 }
    );
  }

  const runId = results.importJob.runId ?? results.companies[0]?.runId;
  if (!runId) {
    return NextResponse.json(
      { error: "Please confirm this import before starting enrichment." },
      { status: 400 }
    );
  }

  const queueResult = await addLeadJob({
    type: "excel_enrichment",
    runId,
    importJobId: id,
    source: "excel_import",
    options: {
      force: body?.force === true,
      limit,
      target
    }
  });

  if (queueResult.queued) {
    await writeRequestAuditLog(request, {
      action: "import.enrich",
      resourceType: "import_job",
      resourceId: id,
      status: "success",
      metadata: { mode: "queue", runId, jobId: queueResult.jobId, limit, target }
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      mode: queueResult.mode,
      runId,
      jobId: queueResult.jobId,
      message: "Enrichment has been queued and will continue in the worker."
    });
  }

  const offset =
    typeof body?.offset === "number" && Number.isFinite(body.offset)
      ? Math.max(0, Math.floor(body.offset))
      : 0;
  const stats = await enrichImportJobCompanies(id, {
    force: body?.force === true,
    limit,
    offset,
    target
  });

  await writeRequestAuditLog(request, {
    action: "import.enrich",
    resourceType: "import_job",
    resourceId: id,
    status: "success",
    metadata: {
      mode: queueResult.mode,
      fallbackReason: queueResult.reason,
      runId,
      target,
      processed: stats.processed,
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
        ? `Enrichment batch completed for ${stats.processed} companies; ${stats.remaining} remaining.`
        : `Enrichment completed for ${stats.processed} companies in the last batch.`,
    stats
  });
}

function parseEnrichmentTarget(value: unknown): ImportJobEnrichmentTarget {
  if (value === "missing_contacts" || value === "failed") return value;
  return "default";
}
