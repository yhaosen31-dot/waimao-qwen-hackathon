import { NextResponse } from "next/server";
import { z } from "zod";
import { approveKeywordsForRun } from "@/lib/review-service";

export const runtime = "nodejs";

const schema = z.object({
  runId: z.string().min(1),
  keywordIds: z.array(z.string().min(1)).min(1)
});

export async function POST(request: Request) {
  const payload = schema.parse(await request.json());

  try {
    const results = await approveKeywordsForRun(payload.runId, payload.keywordIds);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keyword approval failed";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}
