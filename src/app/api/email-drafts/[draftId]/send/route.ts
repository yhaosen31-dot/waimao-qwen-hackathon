import { NextResponse } from "next/server";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { sendApprovedEmailDraft } from "@/services/emailSendService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{
    draftId: string;
  }>;
}

export async function POST(request: Request, context: Context) {
  const rateLimited = await requireRateLimit(request, "email_send");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "email.send",
      resourceType: "email_draft",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { draftId } = await context.params;

  try {
    const result = await sendApprovedEmailDraft(draftId);
    await writeRequestAuditLog(request, {
      action: "email.send",
      resourceType: "email_draft",
      resourceId: draftId,
      status: result.success ? "success" : "failure",
      metadata: {
        mode: result.mode,
        provider: result.provider,
        companyId: result.emailDraft?.companyId,
        emailLogId: result.emailLog?.id
      },
      errorMessage: result.error
    });

    return NextResponse.json({
      ok: result.success,
      mode: result.mode,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      emailDraft: result.emailDraft,
      emailLog: result.emailLog,
      error: result.error
    }, { status: result.success ? 200 : 502 });
  } catch (error) {
    await writeRequestAuditLog(request, {
      action: "email.send",
      resourceType: "email_draft",
      resourceId: draftId,
      status: "failure",
      errorMessage: error instanceof Error ? error.message : "Email send failed."
    });

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Email send failed."
      },
      { status: 400 }
    );
  }
}
