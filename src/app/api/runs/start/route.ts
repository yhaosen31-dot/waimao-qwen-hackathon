import { NextResponse } from "next/server";
import { z } from "zod";
import { runLeadGenerationGraph } from "@/graphs/leadGenerationGraph";
import { persistGraphRunState } from "@/graphs/persistGraphRunState";
import { createRun, getRunResults, updateRun } from "@/lib/store";

export const runtime = "nodejs";

const startRunSchema = z.object({
  productInput: z.string().min(2),
  targetCount: z.coerce.number().int().min(1).max(50)
});

export async function POST(request: Request) {
  const payload = startRunSchema.parse(await request.json());
  const normalizedProduct = payload.productInput.trim().replace(/\s+/g, " ").toLowerCase();
  const run = await createRun({
    productInput: payload.productInput,
    normalizedProduct,
    targetCustomerCount: payload.targetCount,
    metadata: {
      graph: "src/graphs/leadGenerationGraph",
      mode: "mock",
      externalApiCalls: 0
    }
  });

  await updateRun(run.id, {
    status: "running",
    currentStep: "normalizeInput"
  });

  const graphState = await runLeadGenerationGraph({
    runId: run.id,
    productInput: payload.productInput,
    targetCount: payload.targetCount
  });
  await persistGraphRunState(graphState, {
    runStatus: "waiting_review"
  });

  const results = await getRunResults(run.id);

  return NextResponse.json({
    runId: run.id,
    status: results?.run.status ?? "waiting_review",
    companiesCount: results?.companies.length ?? 0
  });
}
