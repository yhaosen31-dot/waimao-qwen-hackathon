import { NextResponse } from "next/server";
import { z } from "zod";
import { applyEmailDraftDecisions } from "@/lib/review-service";

export const runtime = "nodejs";

const approveEmailSchema = z.object({
  drafts: z
    .array(
      z.object({
        id: z.string().min(1),
        companyId: z.string().min(1),
        subject: z.string().min(1),
        body: z.string().min(1),
        action: z.enum(["approve", "skip", "save_draft"]).default("approve")
      })
    )
    .min(1)
});

interface Params {
  params: Promise<{
    runId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  const { runId } = await params;
  const payload = approveEmailSchema.parse(await request.json());

  try {
    const results = await applyEmailDraftDecisions(
      runId,
      payload.drafts.map((draft) => ({
        draftId: draft.id,
        subject: draft.subject,
        body: draft.body,
        action: draft.action
      }))
    );

    return NextResponse.json({
      ok: true,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email review failed";
    const status = message.includes("not found") ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
