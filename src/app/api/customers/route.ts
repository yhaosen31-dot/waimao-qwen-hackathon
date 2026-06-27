import { NextResponse } from "next/server";
import { listCustomers } from "@/server/storage/json-store";

export const runtime = "nodejs";

export async function GET() {
  const customers = await listCustomers();
  return NextResponse.json({ customers });
}
