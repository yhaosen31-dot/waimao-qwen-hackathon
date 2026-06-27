import { NextResponse } from "next/server";
import { z } from "zod";
import { persistWorkflowResult, listTasks } from "@/server/storage/json-store";
import { runLeadGenerationWorkflow } from "@/server/workflows/lead-generation";

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
  const payload = createTaskSchema.parse(await request.json());
  const result = await runLeadGenerationWorkflow(payload);
  await persistWorkflowResult(result);

  return NextResponse.json({
    taskId: result.task.id,
    task: result.task,
    customers: result.customers.length,
    drafts: result.drafts.length
  });
}
