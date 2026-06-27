import { NextResponse } from "next/server";
import { z } from "zod";
import { applyEmailDraftDecision } from "@/lib/review-service";

export const runtime = "nodejs";

const schema = z.object({
  draftId: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1)
});

export async function POST(request: Request) {
  const payload = schema.parse(await request.json());

  try {
    const results = await applyEmailDraftDecision({
      draftId: payload.draftId,
      subject: payload.subject,
      body: payload.body,
      action: "save_draft"
    });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email draft save failed";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}
