import { NextResponse } from "next/server";
import { getCompanyResults, updateCompany } from "@/repositories/store";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { crmCompanyStatuses } from "@/services/companyCrmService";
import { requireRateLimit } from "@/services/rateLimitService";
import type { CompanyStatus } from "@/types";

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

export async function PATCH(request: Request, { params }: Params) {
  const rateLimited = await requireRateLimit(request, "crm_write");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "company.update_status",
      resourceType: "company",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { companyId } = await params;
  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const nextStatus = body?.status;

  if (!nextStatus || !crmCompanyStatuses.includes(nextStatus as CompanyStatus)) {
    return NextResponse.json({ error: "Invalid company status" }, { status: 400 });
  }

  try {
    const company = await updateCompany(companyId, {
      status: nextStatus as CompanyStatus
    });
    await writeRequestAuditLog(request, {
      action: "company.update_status",
      resourceType: "company",
      resourceId: companyId,
      status: "success",
      metadata: { nextStatus }
    });

    return NextResponse.json({ company });
  } catch (error) {
    await writeRequestAuditLog(request, {
      action: "company.update_status",
      resourceType: "company",
      resourceId: companyId,
      status: "failure",
      metadata: { nextStatus },
      errorMessage: error instanceof Error ? error.message : "Failed to update company"
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update company" },
      { status: 404 }
    );
  }
}

