import { NextResponse } from "next/server";
import { z } from "zod";
import { approveKeywordsForRun } from "@/lib/review-service";

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
  const { runId } = await params;
  const payload = approveKeywordsSchema.parse(await request.json());

  try {
    const results = await approveKeywordsForRun(runId, payload.keywordIds);

    return NextResponse.json({
      ok: true,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keyword approval failed";
    const status = message === "Run not found" ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
