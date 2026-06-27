import { NextResponse } from "next/server";
import { z } from "zod";
import { listRuns } from "@/lib/store";
import { startMockLeadRun } from "@/lib/run-workflow";

export const runtime = "nodejs";

const createRunSchema = z.object({
  productInput: z.string().min(2),
  targetCustomerCount: z.coerce.number().int().min(1).max(50)
});

export async function GET() {
  const runs = await listRuns();
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const payload = createRunSchema.parse(await request.json());
  const results = await startMockLeadRun(payload);

  return NextResponse.json({
    runId: results?.run.id,
    results
  });
}
