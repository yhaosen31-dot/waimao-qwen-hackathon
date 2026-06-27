import { NextResponse } from "next/server";
import { getCompanyResults } from "@/lib/store";

export const runtime = "nodejs";

interface Params {
  params: Promise<{
    companyId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { companyId } = await params;
  const results = await getCompanyResults(companyId);

  if (!results) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json(results);
}
