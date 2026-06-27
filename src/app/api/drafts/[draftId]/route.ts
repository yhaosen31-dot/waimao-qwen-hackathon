import { NextResponse } from "next/server";
import { approveDraft } from "@/server/storage/json-store";

export const runtime = "nodejs";

interface Params {
  params: Promise<{
    draftId: string;
  }>;
}

export async function PATCH(_request: Request, { params }: Params) {
  const { draftId } = await params;
  await approveDraft(draftId);

  return NextResponse.json({ ok: true });
}
