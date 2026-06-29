import { NextResponse } from "next/server";
import { listCompanyNotes, saveCompanyNote } from "@/repositories/store";
import { writeRequestAuditLog } from "@/services/auditLogService";
import { requireRateLimit } from "@/services/rateLimitService";

export const runtime = "nodejs";

interface Params {
  params: Promise<{
    companyId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { companyId } = await params;
  const notes = await listCompanyNotes(companyId);

  return NextResponse.json({ notes });
}

export async function POST(request: Request, { params }: Params) {
  const rateLimited = await requireRateLimit(request, "crm_write");
  if (rateLimited) {
    await writeRequestAuditLog(request, {
      action: "company_note.create",
      resourceType: "company",
      status: "blocked",
      metadata: { reason: "rate_limited" }
    });
    return rateLimited;
  }

  const { companyId } = await params;
  const body = (await request.json().catch(() => null)) as { content?: string } | null;
  const content = body?.content?.trim();

  if (!content) {
    return NextResponse.json({ error: "Note content is required" }, { status: 400 });
  }

  try {
    const note = await saveCompanyNote({
      companyId,
      content
    });
    await writeRequestAuditLog(request, {
      action: "company_note.create",
      resourceType: "company",
      resourceId: companyId,
      status: "success",
      metadata: { noteId: note.id }
    });

    return NextResponse.json({ note });
  } catch (error) {
    await writeRequestAuditLog(request, {
      action: "company_note.create",
      resourceType: "company",
      resourceId: companyId,
      status: "failure",
      errorMessage: error instanceof Error ? error.message : "Failed to save note"
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save note" },
      { status: 404 }
    );
  }
}

