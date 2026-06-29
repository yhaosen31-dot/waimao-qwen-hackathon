import { runLeadGenerationGraph, runLeadGenerationGraphFromState } from "@/graphs/leadGenerationGraph";
import { persistGraphRunState } from "@/graphs/persistGraphRunState";
import { createInitialLeadGenerationState } from "@/graphs/state";
import { appLogger } from "@/lib/logger";
import { getRunResults, updateRun, updateRunStep } from "@/repositories/store";
import { writeAuditLog } from "@/services/auditLogService";
import { scoreImportJobBuyerFit } from "@/services/buyerFitScoringService";
import {
  enrichImportJobCompanies,
  type ImportJobEnrichmentTarget
} from "@/services/companyEnrichmentService";
import { generateImportJobEmailDrafts } from "@/services/emailDraftGenerationService";
import type { SearchProviderPreference } from "@/graphs/state";
import type { LeadGenerationStepKey, SearchMode } from "@/types";
import type { LeadJobPayload } from "@/queue/types";

interface JobHandlerContext {
  jobId?: string;
}

export async function handleLeadJob(payload: LeadJobPayload, context: JobHandlerContext = {}) {
  appLogger.info("queue.job_started", {
    jobId: context.jobId,
    type: payload.type,
    runId: payload.runId,
    importJobId: payload.importJobId
  });
  await markRunRunning(payload, context);

  try {
    switch (payload.type) {
      case "excel_enrichment":
        await runExcelEnrichment(payload);
        break;
      case "buyer_fit_scoring":
        await runBuyerFitScoring(payload);
        break;
      case "email_draft_generation":
        await runEmailDraftGeneration(payload);
        break;
      case "full_excel_flow":
        await runExcelEnrichment(payload);
        await runBuyerFitScoring(payload);
        await runEmailDraftGeneration(payload);
        break;
      case "product_search":
      case "full_product_search_flow":
        {
          const queueStatus = await runProductSearch(payload);
          await writeAuditLogWithTimeout({
          actorType: "worker",
          action: `queue.${payload.type}`,
          resourceType: "run",
          resourceId: payload.runId,
          status: "success",
          metadata: {
            jobId: context.jobId,
            source: payload.source,
            queueStatus
          }
        });
        appLogger.info(queueStatus === "waiting_review" ? "queue.job_waiting_review" : "queue.job_completed", {
          jobId: context.jobId,
          type: payload.type,
          runId: payload.runId,
          queueStatus
        });
        return;
        }
      default:
        assertNever(payload.type);
    }

    await finishRun(payload.runId);
    await writeAuditLog({
      actorType: "worker",
      action: `queue.${payload.type}`,
      resourceType: "run",
      resourceId: payload.runId,
      status: "success",
      metadata: {
        jobId: context.jobId,
        importJobId: payload.importJobId,
        source: payload.source
      }
    });
    appLogger.info("queue.job_completed", {
      jobId: context.jobId,
      type: payload.type,
      runId: payload.runId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown queue job error";
    await updateRun(payload.runId, {
      status: "failed",
      metadata: {
        queueStatus: "failed",
        queueError: message,
        failedAt: new Date().toISOString()
      }
    });
    await writeAuditLog({
      actorType: "worker",
      action: `queue.${payload.type}`,
      resourceType: "run",
      resourceId: payload.runId,
      status: "failure",
      metadata: {
        jobId: context.jobId,
        importJobId: payload.importJobId,
        source: payload.source
      },
      errorMessage: message
    });
    appLogger.error("queue.job_failed", {
      jobId: context.jobId,
      type: payload.type,
      runId: payload.runId,
      error: message
    });
    throw error;
  }
}

async function markRunRunning(payload: LeadJobPayload, context: JobHandlerContext) {
  await updateRun(payload.runId, {
    status: "running",
    currentStep: stepForJob(payload.type),
    metadata: {
      queueStatus: "running",
      queueJobId: context.jobId,
      startedAt: new Date().toISOString()
    }
  });
}

async function runExcelEnrichment(payload: LeadJobPayload) {
  const importJobId = requireImportJobId(payload);
  const batchSize = boundedInt(payload.options?.limit, 20, 1, 50);
  const force = payload.options?.force === true;
  const target = enrichmentTargetOption(payload.options?.target);
  const companyConcurrency = boundedInt(
    payload.options?.companyConcurrency ?? process.env.ENRICHMENT_COMPANY_CONCURRENCY,
    1,
    1,
    5
  );
  let totalProcessed = 0;
  let lastStats: Awaited<ReturnType<typeof enrichImportJobCompanies>> | undefined;

  await updateRunStep(payload.runId, "enrichCompanies", {
    status: "running",
    summary: `Queued enrichment is running in the background. Target: ${target}; company concurrency: ${companyConcurrency}.`
  });

  for (let i = 0; i < 100; i += 1) {
    lastStats = await enrichImportJobCompanies(importJobId, {
      force,
      target,
      concurrency: companyConcurrency,
      limit: batchSize,
      offset: 0
    });
    totalProcessed += lastStats.processed;

    await updateRun(payload.runId, {
      metadata: {
        queueStatus: "running",
        currentQueueStep: "excel_enrichment",
        enrichmentTarget: target,
        companyConcurrency,
        progress: {
          processed: totalProcessed,
          eligible: lastStats.eligible,
          remaining: lastStats.remaining
        }
      }
    });

    if (lastStats.remaining <= 0 || lastStats.processed === 0) break;
  }

  await updateRunStep(payload.runId, "enrichCompanies", {
    status: "completed",
    summary: `Background enrichment processed ${totalProcessed} companies for ${target}; ${lastStats?.remaining ?? 0} remaining.`
  });
}

async function runBuyerFitScoring(payload: LeadJobPayload) {
  const importJobId = requireImportJobId(payload);
  const batchSize = boundedInt(payload.options?.limit, 10, 1, 20);
  let lastStats: Awaited<ReturnType<typeof scoreImportJobBuyerFit>> | undefined;

  await updateRunStep(payload.runId, "scoreBuyerFit", {
    status: "running",
    summary: "Queued Buyer Fit scoring is running in the background."
  });

  for (let i = 0; i < 100; i += 1) {
    lastStats = await scoreImportJobBuyerFit(importJobId, {
      limit: batchSize
    });

    await updateRun(payload.runId, {
      metadata: {
        queueStatus: "running",
        currentQueueStep: "buyer_fit_scoring",
        progress: {
          scored: lastStats.scored,
          remaining: lastStats.remaining,
          high: lastStats.high,
          medium: lastStats.medium,
          low: lastStats.low,
          unknown: lastStats.unknown
        }
      }
    });

    if (lastStats.remaining <= 0 || lastStats.processed === 0) break;
  }

  await updateRunStep(payload.runId, "scoreBuyerFit", {
    status: "completed",
    summary: `Background Buyer Fit scoring completed for ${lastStats?.scored ?? 0}/${lastStats?.total ?? 0} companies.`
  });
}

async function runEmailDraftGeneration(payload: LeadJobPayload) {
  const importJobId = requireImportJobId(payload);

  await updateRunStep(payload.runId, "generateEmailDraft", {
    status: "running",
    summary: "Queued email draft generation is running in the background."
  });

  const stats = await generateImportJobEmailDrafts(importJobId);

  await updateRun(payload.runId, {
    metadata: {
      queueStatus: stats.generated > 0 ? "waiting_review" : "running",
      currentQueueStep: "email_draft_generation",
      progress: {
        generated: stats.generated,
        skippedNoEmail: stats.skippedNoEmail,
        skippedLowOrSkip: stats.skippedLowOrSkip
      }
    }
  });
}

async function runProductSearch(payload: LeadJobPayload): Promise<"waiting_review" | "completed"> {
  const results = await getRunResults(payload.runId);
  if (!results) throw new Error(`Run not found: ${payload.runId}`);

  const metadata = results.run.metadata ?? {};
  const productInput = stringOption(payload.options?.productInput) ?? results.run.productInput;
  const targetCount = boundedInt(
    payload.options?.targetCount ?? results.run.targetCustomerCount,
    results.run.targetCustomerCount,
    1,
    50
  );
  const targetCountries = stringArrayOption(payload.options?.targetCountries) ?? stringArrayOption(metadata.targetCountries) ?? [];
  const excludedCountries =
    stringArrayOption(payload.options?.excludedCountries) ?? stringArrayOption(metadata.excludedCountries) ?? [];
  const searchMode = searchModeOption(payload.options?.searchMode ?? metadata.searchMode);
  const providerPriority = providerPriorityOption(
    payload.options?.providerPriority ?? metadata.providerPriority
  );
  const approvedKeywords =
    stringArrayOption(payload.options?.approvedKeywords) ??
    results.keywords
      .filter((keyword) => keyword.status === "approved")
      .map((keyword) => keyword.value);
  const shouldContinueAfterKeywordApproval =
    payload.options?.phase === "after_keyword_approval" ||
    results.run.keywordReviewStatus === "approved" ||
    approvedKeywords.length > 0;

  if (shouldContinueAfterKeywordApproval) {
    if (approvedKeywords.length === 0) {
      throw new Error("Product search continuation requires approved keywords.");
    }

    await updateRunStep(payload.runId, "searchCustomersByProduct", {
      status: "running",
      summary: "Queued product search is running after keyword approval.",
      startedAt: new Date().toISOString()
    });
    await updateRun(payload.runId, {
      status: "running",
      currentStep: "searchCustomersByProduct",
      metadata: {
        queueStatus: "running",
        currentQueueStep: "searchCustomersByProduct"
      }
    });

    const graphState = await runLeadGenerationGraphFromState({
      ...createInitialLeadGenerationState({
        runId: payload.runId,
        productInput,
        targetCount,
        targetCountries,
        excludedCountries,
        searchMode,
        providerPriority
      }),
      normalizedProduct: results.run.normalizedProduct,
      keywords: results.keywords.map((keyword) => keyword.value),
      keywordInsights: results.keywords.map((keyword) => ({
        value: keyword.value,
        score: keyword.confidence ?? 0.9,
        reason: keyword.reason ?? "MiniMax keyword generated for importer discovery."
      })),
      approvedKeywords
    });

    await persistGraphRunState(graphState, {
      runStatus: graphState.emailDrafts.length > 0 ? "waiting_review" : "completed"
    });
    const queueStatus = graphState.emailDrafts.length > 0 ? "waiting_review" : "completed";

    await updateRun(payload.runId, {
      status: queueStatus,
      currentStep: queueStatus === "waiting_review" ? "humanApproveEmail" : "saveToCrm",
      metadata: {
        queueStatus,
        currentQueueStep: queueStatus === "waiting_review" ? "humanApproveEmail" : "saveToCrm",
        completedAt: new Date().toISOString()
      }
    });
    return queueStatus;
  }

  const graphState = await runLeadGenerationGraph({
    runId: payload.runId,
    productInput,
    targetCount,
    targetCountries,
    excludedCountries,
    searchMode,
    providerPriority
  });

  await persistGraphRunState(graphState, {
    runStatus: "waiting_review"
  });

  await updateRun(payload.runId, {
    metadata: {
      queueStatus: "waiting_review",
      currentQueueStep: "human_review",
      completedAt: new Date().toISOString()
    }
  });
  return "waiting_review";
}

async function writeAuditLogWithTimeout(input: Parameters<typeof writeAuditLog>[0]) {
  try {
    await Promise.race([
      writeAuditLog(input),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Audit log write timed out.")), 5_000)
      )
    ]);
  } catch (error) {
    appLogger.warn("queue.audit_log_skipped", {
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      error: error instanceof Error ? error.message : "Unknown audit log error"
    });
  }
}

async function finishRun(runId: string) {
  const results = await getRunResults(runId);
  const status = results?.run.status === "waiting_review" ? "waiting_review" : "completed";
  await updateRun(runId, {
    status,
    metadata: {
      queueStatus: status,
      completedAt: new Date().toISOString()
    }
  });
}

function requireImportJobId(payload: LeadJobPayload) {
  if (!payload.importJobId) {
    throw new Error(`${payload.type} requires importJobId.`);
  }
  return payload.importJobId;
}

function stepForJob(type: LeadJobPayload["type"]): LeadGenerationStepKey {
  if (type === "product_search" || type === "full_product_search_flow") return "normalizeInput";
  if (type === "buyer_fit_scoring") return "scoreBuyerFit";
  if (type === "email_draft_generation") return "generateEmailDraft";
  return "enrichCompanies";
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function enrichmentTargetOption(value: unknown): ImportJobEnrichmentTarget {
  if (value === "missing_contacts" || value === "failed") return value;
  return "default";
}

function stringOption(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayOption(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))).slice(0, 20);
}

function searchModeOption(value: unknown): SearchMode {
  if (value === "economy" || value === "fallback" || value === "deep_verify") return value;
  return "fallback";
}

function providerPriorityOption(value: unknown): SearchProviderPreference[] {
  const providers = stringArrayOption(value) ?? (typeof value === "string" ? [value] : []);
  const valid = providers.filter(
    (item): item is SearchProviderPreference => item === "exa" || item === "tavily" || item === "you"
  );
  return valid.length > 0 ? valid : ["exa"];
}

function assertNever(value: never): never {
  throw new Error(`Unsupported lead job type: ${String(value)}`);
}
