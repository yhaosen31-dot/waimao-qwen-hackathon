import { NextResponse } from "next/server";
import { searchAggregationService } from "@/services/searchAggregationService";

export const runtime = "nodejs";

export async function POST() {
  const statuses = await searchAggregationService.testProviders();

  return NextResponse.json(statuses);
}
