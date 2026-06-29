import { NextResponse } from "next/server";
import { z } from "zod";
import { runLeadGenerationGraph } from "@/graphs/leadGenerationGraph";
import { persistGraphRunState } from "@/graphs/persistGraphRunState";
import { addLeadJob } from "@/queue/leadQueue";
import { createRun, getRunResults, updateRun } from "@/repositories/store";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";

const startRunSchema = z.object({
  productInput: z.string().min(2),
  targetCount: z.coerce.number().int().min(1).max(50),
  targetCountries: z.array(z.string()).optional().default([]),
  excludedCountries: z.array(z.string()).optional().default([]),
  searchMode: z.enum(["economy", "fallback", "deep_verify"]).optional().default("economy"),
  providerPriority: z.enum(["exa", "tavily", "you"]).optional().default("exa")
});

export async function POST(request: Request) {
  const rateLimited = await requireRateLimit(request, "runs_start");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "run.start",
      resourceType: "run",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const payload = startRunSchema.parse(await request.json());
  const normalizedProduct = payload.productInput.trim().replace(/\s+/g, " ").toLowerCase();
  const targetCountries = normalizeCountryList(payload.targetCountries);
  const excludedCountries = normalizeCountryList(payload.excludedCountries);
  const run = await createRun({
    productInput: payload.productInput,
    normalizedProduct,
    targetCustomerCount: payload.targetCount,
    metadata: {
      graph: "src/graphs/leadGenerationGraph",
      mode: "product_search",
      targetCountries,
      excludedCountries,
      searchMode: payload.searchMode,
      providerPriority: [payload.providerPriority],
      externalApiCalls: 0
    }
  });

  const queueResult = await addLeadJob({
    type: "product_search",
    runId: run.id,
    source: "product_search",
    options: {
      productInput: payload.productInput,
      targetCount: payload.targetCount,
      targetCountries,
      excludedCountries,
      searchMode: payload.searchMode,
      providerPriority: [payload.providerPriority]
    }
  });

  if (queueResult.queued) {
    await writeRequestAuditLog(request, {
      action: "run.start",
      resourceType: "run",
      resourceId: run.id,
      status: "success",
      metadata: {
        mode: "queue",
        jobId: queueResult.jobId,
        productInput: payload.productInput,
        targetCount: payload.targetCount
      }
    });

    return NextResponse.json({
      runId: run.id,
      status: "queued",
      queued: true,
      jobId: queueResult.jobId,
      companiesCount: 0
    });
  }

  await updateRun(run.id, {
    status: "running",
    currentStep: "normalizeInput"
  });

  const graphState = await runLeadGenerationGraph({
    runId: run.id,
    productInput: payload.productInput,
    targetCount: payload.targetCount,
    targetCountries,
    excludedCountries,
    searchMode: payload.searchMode,
    providerPriority: [payload.providerPriority]
  });
  await persistGraphRunState(graphState, {
    runStatus: "waiting_review"
  });

  const results = await getRunResults(run.id);

  await writeRequestAuditLog(request, {
    action: "run.start",
    resourceType: "run",
    resourceId: run.id,
    status: "success",
    metadata: {
      mode: queueResult.mode,
      fallbackReason: queueResult.reason,
      productInput: payload.productInput,
      targetCount: payload.targetCount,
      companiesCount: results?.companies.length ?? 0
    }
  });

  return NextResponse.json({
    runId: run.id,
    status: results?.run.status ?? "waiting_review",
    queued: false,
    mode: queueResult.mode,
    queueFallbackReason: queueResult.reason,
    companiesCount: results?.companies.length ?? 0
  });
}

function normalizeCountryList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 20);
}
