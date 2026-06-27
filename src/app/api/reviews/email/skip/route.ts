import { NextResponse } from "next/server";
import { z } from "zod";
import { applyEmailDraftDecision } from "@/lib/review-service";

export const runtime = "nodejs";

const schema = z.object({
  draftId: z.string().min(1)
});

export async function POST(request: Request) {
  const payload = schema.parse(await request.json());

  try {
    const results = await applyEmailDraftDecision({
      draftId: payload.draftId,
      action: "skip"
    });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email skip failed";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}
