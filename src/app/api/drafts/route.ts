import { NextResponse } from "next/server";
import { listDrafts } from "@/server/storage/json-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId") ?? undefined;
  const drafts = await listDrafts(taskId);

  return NextResponse.json({ drafts });
}
