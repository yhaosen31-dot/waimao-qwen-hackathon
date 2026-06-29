import { NextResponse } from "next/server";
import { readCrmStore } from "@/repositories/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const db = await readCrmStore();
  const drafts = [...db.emailDrafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hydrated = drafts
    .filter((draft) => (status ? draft.status === status : true))
    .map((draft) => ({
      ...draft,
      company: db.companies.find((company) => company.id === draft.companyId),
      toEmail:
        draft.toEmail ??
        db.emailAddresses.find((email) => email.id === draft.toEmailAddressId)?.email ??
        db.emailAddresses.find((email) => email.companyId === draft.companyId)?.email
    }));

  return NextResponse.json({ emailDrafts: hydrated });
}
