import { NextResponse } from "next/server";
import { listEmailDrafts, readStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const [drafts, db] = await Promise.all([listEmailDrafts(), readStore()]);
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
