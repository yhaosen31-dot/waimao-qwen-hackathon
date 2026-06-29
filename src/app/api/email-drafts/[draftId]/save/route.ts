import { NextResponse } from "next/server";
import { z } from "zod";
import { applyEmailDraftDecision } from "@/lib/review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  subject: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional()
});

interface Context {
  params: Promise<{
    draftId: string;
  }>;
}

export async function POST(request: Request, context: Context) {
  const { draftId } = await context.params;
  const payload = schema.parse(await request.json());
  const results = await applyEmailDraftDecision({
    draftId,
    subject: payload.subject,
    body: payload.body,
    action: "save_draft"
  });

  return NextResponse.json({ ok: true, results });
}
