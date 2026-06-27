import { completeNode, type GraphEmailDraft, type LeadGenerationGraphState } from "@/graphs/state";
import { minimaxProvider } from "@/providers/minimaxProvider";

export async function generateEmailDraft(state: LeadGenerationGraphState) {
  if (state.emailDrafts.length > 0) {
    return {
      emailDrafts: state.emailDrafts,
      ...completeNode(
        state,
        "generateEmailDraft",
        `Reused ${state.emailDrafts.length} reviewed email drafts.`
      )
    };
  }

  const emailDrafts: GraphEmailDraft[] = await Promise.all(
    state.companies.map(async (company) => {
      const draft = await minimaxProvider.invoke({
        productName: state.normalizedProduct ?? state.productInput,
        companyName: company.name,
        buyerSignals: company.buyerFitReasons,
        contactName: company.contactName
      });
      const toEmail = company.emails[0] ?? `procurement@${company.domain}`;

      return {
        id: `${company.id}_email_draft_1`,
        companyId: company.id,
        to: toEmail,
        toEmail,
        subject: draft.subject,
        body: draft.body,
        status: "waiting_review",
        personalizationNotes: draft.personalizationNotes
      };
    })
  );
  const companies = state.companies.map((company) => {
    const draft = emailDrafts.find((item) => item.companyId === company.id);

    return {
      ...company,
      evidence: [
        ...company.evidence,
        {
          type: "email_draft_mock" as const,
          title: "Mock email draft generation",
          url: company.website,
          snippet: `Generated outreach draft from buyer fit reasons and source keyword "${company.sourceKeyword}".`,
          rawText: draft?.subject ?? "",
          confidence: 0.8
        }
      ]
    };
  });

  return {
    companies,
    emailDrafts,
    ...completeNode(
      state,
      "generateEmailDraft",
      `Generated ${emailDrafts.length} mock email drafts via ${minimaxProvider.name}.`
    )
  };
}
