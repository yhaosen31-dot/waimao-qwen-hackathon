import { NextResponse } from "next/server";
import { z } from "zod";
import { listTasks } from "@/server/storage/json-store";

export const runtime = "nodejs";

const createTaskSchema = z.object({
  productName: z.string().min(2),
  targetCount: z.coerce.number().int().min(1).max(50)
});

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  createTaskSchema.parse(await request.json());

  return NextResponse.json(
    {
      ok: false,
      message: "Legacy task workflow is disabled. Use /api/runs/start or Excel import instead."
    },
    { status: 410 }
  );
}
