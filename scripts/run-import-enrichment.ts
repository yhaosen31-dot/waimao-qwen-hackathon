import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getImportJobResults, updateRun, updateRunStep } from "@/repositories/store";
import { enrichImportJobCompanies } from "@/services/companyEnrichmentService";

const importJobId = process.argv[2];
const batchSize = boundedInt(process.argv[3], 1, 1, 5);
const maxLoops = boundedInt(process.argv[4], 200, 1, 500);
const logPath = path.join(process.cwd(), "logs", `enrichment-${importJobId ?? "unknown"}.log`);

if (!importJobId) {
  console.error("Usage: tsx scripts/run-import-enrichment.ts <importJobId> [batchSize] [maxLoops]");
  process.exit(1);
}

await main().catch(async (error) => {
  await logLine(`fatal ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});

async function main() {
  const initial = await getImportJobResults(importJobId);
  if (!initial) throw new Error(`Import job not found: ${importJobId}`);

  const runId = initial.importJob.runId ?? initial.companies[0]?.runId;
  if (!runId) throw new Error(`Import job ${importJobId} has no runId. Confirm import first.`);

  await logLine(`start importJobId=${importJobId} runId=${runId} batchSize=${batchSize}`);
  await updateRun(runId, {
    status: "running",
    currentStep: "enrichCompanies",
    metadata: {
      localBackgroundEnrichment: true,
      queueStatus: "running",
      currentQueueStep: "excel_enrichment",
      startedAt: new Date().toISOString()
    }
  });
  await updateRunStep(runId, "enrichCompanies", {
    status: "running",
    summary: "Local background enrichment is running."
  });

  let processedTotal = 0;
  let lastRemaining = Number.POSITIVE_INFINITY;

  for (let loop = 1; loop <= maxLoops; loop += 1) {
    const stats = await enrichImportJobCompanies(importJobId, {
      limit: batchSize,
      offset: 0
    });
    processedTotal += stats.processed;
    lastRemaining = stats.remaining;

    await updateRun(runId, {
      metadata: {
        localBackgroundEnrichment: true,
        queueStatus: "running",
        currentQueueStep: "excel_enrichment",
        progress: {
          processed: processedTotal,
          remaining: stats.remaining,
          completed: stats.completed,
          failed: stats.failed,
          websiteFound: stats.websiteFound,
          emailsFound: stats.emailsFound,
          whatsappFound: stats.whatsappFound
        }
      }
    });

    await logLine(
      [
        `loop=${loop}`,
        `processed=${stats.processed}`,
        `processedTotal=${processedTotal}`,
        `remaining=${stats.remaining}`,
        `completed=${stats.completed}`,
        `failed=${stats.failed}`,
        `websiteFound=${stats.websiteFound}`,
        `emailsFound=${stats.emailsFound}`,
        `whatsappFound=${stats.whatsappFound}`
      ].join(" ")
    );

    if (stats.remaining <= 0 || stats.processed === 0) break;
  }

  const finalResults = await getImportJobResults(importJobId);
  const completed = finalResults?.companies.filter((company) => company.enrichmentStatus === "completed").length ?? 0;
  const needsReview = finalResults?.companies.filter((company) => company.enrichmentStatus === "needs_review").length ?? 0;
  const failed = finalResults?.companies.filter((company) => company.enrichmentStatus === "failed").length ?? 0;
  const pending = finalResults?.companies.filter((company) => company.enrichmentStatus === "pending").length ?? 0;

  await updateRunStep(runId, "enrichCompanies", {
    status: pending > 0 ? "paused" : "completed",
    summary: `Local background enrichment finished. completed=${completed}, needs_review=${needsReview}, failed=${failed}, pending=${pending}.`
  });
  await updateRun(runId, {
    status: pending > 0 ? "paused" : "completed",
    metadata: {
      localBackgroundEnrichment: true,
      queueStatus: pending > 0 ? "paused" : "completed",
      currentQueueStep: "excel_enrichment",
      completedAt: new Date().toISOString(),
      progress: {
        processed: processedTotal,
        remaining: lastRemaining,
        completed,
        needsReview,
        failed,
        pending
      }
    }
  });
  await logLine(`finish completed=${completed} needsReview=${needsReview} failed=${failed} pending=${pending}`);
}

async function logLine(message: string) {
  const line = `${new Date().toISOString()} ${message}\n`;
  process.stdout.write(line);
  await mkdir(path.dirname(logPath), { recursive: true }).catch(() => undefined);
  await appendFile(logPath, line, "utf8").catch(() => undefined);
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}
