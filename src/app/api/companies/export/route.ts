import { NextResponse } from "next/server";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { buildCompaniesCsv, getFilteredCrmCompanies } from "@/services/companyCrmService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const rateLimited = await requireRateLimit(request, "companies_export");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "companies.export",
      resourceType: "company",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { searchParams } = new URL(request.url);
  const { companies } = await getFilteredCrmCompanies(Object.fromEntries(searchParams));
  const csv = buildCompaniesCsv(companies);
  await writeRequestAuditLog(request, {
    action: "companies.export",
    resourceType: "company",
    status: "success",
    metadata: {
      exportedCount: companies.length,
      filters: Object.fromEntries(searchParams)
    }
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="companies.csv"`
    }
  });
}
