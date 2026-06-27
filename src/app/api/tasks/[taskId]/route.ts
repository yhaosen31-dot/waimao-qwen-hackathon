import { NextResponse } from "next/server";
import { getTaskBundle } from "@/server/storage/json-store";

export const runtime = "nodejs";

interface Params {
  params: Promise<{
    taskId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  const bundle = await getTaskBundle(taskId);

  if (!bundle) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(bundle);
}
