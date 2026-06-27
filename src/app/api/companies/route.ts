import { NextResponse } from "next/server";
import { listCompanies, readStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter");
  const [companies, db] = await Promise.all([listCompanies(), readStore()]);
  const hydrated = companies.map((company) => {
    const emails = db.emailAddresses.filter((email) => email.companyId === company.id);
    const whatsappNumbers = db.whatsappNumbers.filter(
      (whatsapp) => whatsapp.companyId === company.id
    );
    const emailDrafts = db.emailDrafts.filter((draft) => draft.companyId === company.id);
    const primaryDraft = emailDrafts[0];

    return {
      ...company,
      emails,
      whatsappNumbers,
      emailDrafts,
      emailStatus: primaryDraft?.status ?? "none"
    };
  });
  const filtered = hydrated.filter((company) => {
    const score = company.buyerFitScore ?? 0;
    if (filter === "high_fit") return score >= 85;
    if (filter === "medium_fit") return score >= 70 && score < 85;
    if (filter === "low_fit") return score < 70;
    if (filter === "email_approved") return company.emailStatus === "approved";
    if (filter === "email_skipped") return company.emailStatus === "skipped";
    if (filter === "saved_to_crm") return company.status === "saved_to_crm";
    return true;
  });

  return NextResponse.json({ companies: filtered });
}
