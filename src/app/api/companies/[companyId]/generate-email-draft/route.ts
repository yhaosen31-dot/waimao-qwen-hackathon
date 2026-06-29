import { NextResponse } from "next/server";
import { forceGenerateCompanyEmailDraft } from "@/services/emailDraftGenerationService";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{
    companyId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  const rateLimited = await requireRateLimit(request, "email_draft_generation");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "company.force_generate_email_draft",
      resourceType: "company",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { companyId } = await params;

  try {
    const result = await forceGenerateCompanyEmailDraft(companyId);
    await writeRequestAuditLog(request, {
      action: "company.force_generate_email_draft",
      resourceType: "company",
      resourceId: companyId,
      status: "success",
      metadata: {
        created: result.created,
        draftId: result.draft.id
      }
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      draftId: result.draft.id,
      status: result.draft.status,
      message: result.message
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate email draft.";
    await writeRequestAuditLog(request, {
      action: "company.force_generate_email_draft",
      resourceType: "company",
      resourceId: companyId,
      status: "failure",
      errorMessage: message
    });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
