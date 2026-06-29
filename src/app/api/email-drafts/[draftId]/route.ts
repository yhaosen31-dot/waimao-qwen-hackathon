import { NextResponse } from "next/server";
import { getEmailDraft, readCrmStore } from "@/repositories/store";

export const runtime = "nodejs";

interface Params {
  params: Promise<{
    draftId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { draftId } = await params;
  const [draft, db] = await Promise.all([getEmailDraft(draftId), readCrmStore()]);

  if (!draft) {
    return NextResponse.json({ error: "Email draft not found" }, { status: 404 });
  }

  return NextResponse.json({
    emailDraft: {
      ...draft,
      company: db.companies.find((company) => company.id === draft.companyId),
      toEmail:
        draft.toEmail ??
        db.emailAddresses.find((email) => email.id === draft.toEmailAddressId)?.email ??
        db.emailAddresses.find((email) => email.companyId === draft.companyId)?.email
    }
  });
}
