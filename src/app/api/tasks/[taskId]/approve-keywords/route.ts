import { NextResponse } from "next/server";
import { z } from "zod";
import { approveTaskKeywords } from "@/server/storage/json-store";

export const runtime = "nodejs";

const approveSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1)
});

interface Params {
  params: Promise<{
    taskId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  const { taskId } = await params;
  const payload = approveSchema.parse(await request.json());
  await approveTaskKeywords(taskId, payload.keywords);

  return NextResponse.json({ ok: true });
}
