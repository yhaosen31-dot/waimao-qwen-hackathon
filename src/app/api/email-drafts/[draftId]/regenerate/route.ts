import { NextResponse } from "next/server";
import { regenerateEmailDraft } from "@/services/emailDraftGenerationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{
    draftId: string;
  }>;
}

export async function POST(_request: Request, context: Context) {
  const { draftId } = await context.params;
  const draft = await regenerateEmailDraft(draftId);

  return NextResponse.json({ ok: true, emailDraft: draft });
}
