import { completeNode, type GraphEmailDraft, type LeadGenerationGraphState } from "@/graphs/state";
import { minimaxProvider } from "@/providers/minimaxProvider";

export async function generateEmailDraft(state: LeadGenerationGraphState) {
  if (state.emailDrafts.length > 0) {
    return {
      emailDrafts: state.emailDrafts,
      ...completeNode(
        state,
        "generateEmailDraft",
        `Reused ${state.emailDrafts.length} existing email drafts.`
      )
    };
  }

  const generated = await Promise.all(
    state.companies.map(async (company) => {
      if (!isEligibleForEmail(company)) return null;
      const toEmail = chooseGraphEmail(company.emails);
      if (!toEmail) return null;

      const evidenceIds = company.evidence.map((item, index) => `${company.id}_evidence_${index + 1}`);
      const evidenceSummary = company.evidence
        .map((item) => `${item.type}: ${item.rawText ?? item.snippet}`)
        .slice(0, 12)
        .join("\n");
      const draft = await minimaxProvider.generateColdEmail({
        companyId: company.id,
        companyName: company.name,
        country: company.country,
        website: company.website,
        domain: company.domain,
        recommendedEmail: toEmail,
        productName: state.normalizedProduct ?? state.productInput,
        productDescription: company.productDescription ?? company.products.join(", "),
        transactionSummary: company.transactionSummary,
        buyerFit: company.buyerFitTier ?? "unknown",
        companyRole: company.companyRole,
        leadScore: company.leadScore,
        suggestedAction: company.suggestedAction,
        evidenceSummary,
        reasons: company.buyerFitReasons,
        risks: company.buyerFitRisks,
        evidenceIds
      });

      return {
        draft: {
          id: `${company.id}_email_draft_1`,
          companyId: company.id,
          to: toEmail,
          toEmail,
          subject: draft.subject,
          body: draft.body,
          status: "waiting_review",
          personalizationNotes: draft.styleNotes
        } satisfies GraphEmailDraft,
        evidence: {
          type: "email_draft" as const,
          title: "Email draft generation",
          url: company.website,
          snippet: `Generated waiting_review email draft for ${toEmail}.`,
          source: "minimax",
          rawText: [
            `subject=${draft.subject}`,
            draft.fallbackReason ? `fallback=${draft.fallbackReason}` : ""
          ]
            .filter(Boolean)
            .join("\n"),
          confidence: company.confidence ?? 0.75
        }
      };
    })
  );
  const emailDrafts = generated.flatMap((item) => (item ? [item.draft] : []));
  const companies = state.companies.map((company) => {
    const evidence = generated.find((item) => item?.draft.companyId === company.id)?.evidence;

    return evidence
      ? {
          ...company,
          status: "drafted" as const,
          evidence: [...company.evidence, evidence]
        }
      : company;
  });

  return {
    companies,
    emailDrafts,
    ...completeNode(
      state,
      "generateEmailDraft",
      `Generated ${emailDrafts.length} evidence-based email drafts via ${minimaxProvider.name}.`
    )
  };
}

function isEligibleForEmail(company: LeadGenerationGraphState["companies"][number]) {
  if ((company as { status?: string }).status === "blacklist") return false;
  if (company.suggestedAction === "skip") return false;
  if (company.buyerFitTier === "low") return false;
  return (
    company.buyerFitTier === "high" ||
    company.buyerFitTier === "medium" ||
    company.suggestedAction === "email_first" ||
    company.suggestedAction === "manual_review"
  );
}

function chooseGraphEmail(emails: string[]) {
  return (
    emails.find((email) => /^(purchase|procurement|sourcing)[._-]?/i.test(email.split("@")[0] ?? "")) ??
    emails.find((email) => /^(sales|info|contact)[._-]?/i.test(email.split("@")[0] ?? "")) ??
    emails[0]
  );
}
