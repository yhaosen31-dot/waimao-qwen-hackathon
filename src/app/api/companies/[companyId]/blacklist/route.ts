import { NextResponse } from "next/server";
import { updateCompany } from "@/repositories/store";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";

interface Params {
  params: Promise<{
    companyId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  const rateLimited = await requireRateLimit(request, "crm_write");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "company.blacklist",
      resourceType: "company",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { companyId } = await params;

  try {
    const company = await updateCompany(companyId, {
      status: "blacklist"
    });
    await writeRequestAuditLog(request, {
      action: "company.blacklist",
      resourceType: "company",
      resourceId: companyId,
      status: "success"
    });

    return NextResponse.json({
      company,
      message: "Company has been added to blacklist."
    });
  } catch (error) {
    await writeRequestAuditLog(request, {
      action: "company.blacklist",
      resourceType: "company",
      resourceId: companyId,
      status: "failure",
      errorMessage: error instanceof Error ? error.message : "Failed to blacklist company"
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to blacklist company" },
      { status: 404 }
    );
  }
}

