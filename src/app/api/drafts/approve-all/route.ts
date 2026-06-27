import { NextResponse } from "next/server";
import { z } from "zod";
import { approveAllDrafts } from "@/server/storage/json-store";

export const runtime = "nodejs";

const approveAllSchema = z.object({
  taskId: z.string().min(1)
});

export async function POST(request: Request) {
  const payload = approveAllSchema.parse(await request.json());
  await approveAllDrafts(payload.taskId);

  return NextResponse.json({ ok: true });
}
