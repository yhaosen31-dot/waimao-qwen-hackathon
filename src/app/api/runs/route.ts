import { NextResponse } from "next/server";
import { z } from "zod";
import { listRuns } from "@/repositories/store";

export const runtime = "nodejs";

const createRunSchema = z.object({
  productInput: z.string().min(2),
  targetCustomerCount: z.coerce.number().int().min(1).max(50)
});

export async function GET() {
  const runs = await listRuns();
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  createRunSchema.parse(await request.json());

  return NextResponse.json(
    {
      ok: false,
      message: "Legacy demo run API is disabled. Use /api/runs/start for product search."
    },
    { status: 410 }
  );
}
