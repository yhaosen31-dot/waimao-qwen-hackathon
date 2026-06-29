import { NextResponse } from "next/server";
import { getRunResults } from "@/repositories/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{
    runId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { runId } = await params;
  const results = await getRunResults(runId);

  if (!results) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(results);
}
