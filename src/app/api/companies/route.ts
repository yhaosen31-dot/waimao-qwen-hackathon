import { NextResponse } from "next/server";
import { getFilteredCrmCompanies } from "@/services/companyCrmService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { companies } = await getFilteredCrmCompanies(Object.fromEntries(searchParams));

  return NextResponse.json({ companies });
}
