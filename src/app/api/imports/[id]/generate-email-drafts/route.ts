import { NextResponse } from "next/server";
import { addLeadJob } from "@/queue/leadQueue";
import { getImportJobResults } from "@/repositories/store";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { generateImportJobEmailDrafts } from "@/services/emailDraftGenerationService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: Request, context: Context) {
  const rateLimited = await requireRateLimit(request, "email_draft_generation");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "email_draft.generate",
      resourceType: "import_job",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { id } = await context.params;
  const results = await getImportJobResults(id);

  if (!results) {
    return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  }

  const runId = results.importJob.runId ?? results.companies[0]?.runId;
  if (!runId) {
    return NextResponse.json(
      { error: "Please confirm this import before generating email drafts." },
      { status: 400 }
    );
  }

  const queueResult = await addLeadJob({
    type: "email_draft_generation",
    runId,
    importJobId: id,
    source: "excel_import"
  });

  if (queueResult.queued) {
    await writeRequestAuditLog(request, {
      action: "email_draft.generate",
      resourceType: "import_job",
      resourceId: id,
      status: "success",
      metadata: { mode: "queue", runId, jobId: queueResult.jobId }
    });

    return NextResponse.json({
      ok: true,
      queued: true,
      mode: queueResult.mode,
      runId,
      jobId: queueResult.jobId,
      message: "Email draft generation has been queued and will continue in the worker."
    });
  }

  const stats = await generateImportJobEmailDrafts(id);

  await writeRequestAuditLog(request, {
    action: "email_draft.generate",
    resourceType: "import_job",
    resourceId: id,
    status: "success",
    metadata: {
      mode: queueResult.mode,
      fallbackReason: queueResult.reason,
      runId,
      generated: stats.generated,
      skippedNoEmail: stats.skippedNoEmail,
      skippedLowOrSkip: stats.skippedLowOrSkip
    }
  });

  return NextResponse.json({
    ok: true,
    queued: false,
    mode: queueResult.mode,
    queueFallbackReason: queueResult.reason,
    message: `Generated ${stats.generated} email draft(s).`,
    stats
  });
}
