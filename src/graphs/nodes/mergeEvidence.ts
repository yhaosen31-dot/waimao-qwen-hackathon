import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";

export async function mergeEvidence(state: LeadGenerationGraphState) {
  const companies = state.companies.map((company) => {
    const evidenceByKey = new Map(
      company.evidence.map((item) => [`${item.type}:${item.url ?? item.rawText ?? item.title}`, item])
    );
    const evidence = Array.from(evidenceByKey.values()).sort((a, b) => b.confidence - a.confidence);
    const hasWebsite = Boolean(company.website || evidence.some((item) => item.type === "website_search"));
    const hasPhone = Boolean(company.phone) || evidence.some((item) => item.type === "phone_search");
    const hasWhatsapp = Boolean(company.whatsapp) || evidence.some((item) => item.type === "whatsapp_search");
    const hasSocial = Boolean(company.linkedin || company.facebook) || evidence.some((item) => item.type === "social_search");
    const confidenceInputs = evidence
      .filter((item) =>
        [
          "website_search",
          "email_search",
          "phone_search",
          "whatsapp_search",
          "social_search",
          "contact_search"
        ].includes(item.type)
      )
      .map((item) => item.confidence)
      .filter((value) => value > 0);
    const contactConfidence =
      confidenceInputs.length > 0
        ? Math.round(
            (confidenceInputs.reduce((sum, value) => sum + value, 0) / confidenceInputs.length) * 100
          )
        : 0;
    const needsReview =
      company.websiteStatus === "needs_review" ||
      company.contactStatus === "needs_review" ||
      (contactConfidence > 0 && contactConfidence < 55);

    return {
      ...company,
      evidence,
      evidenceSummary: [
        hasWebsite ? "website found" : "website not found",
        `${company.emails.length} email(s)`,
        hasPhone ? "phone found" : "phone not found",
        hasWhatsapp ? "WhatsApp found" : "WhatsApp not found",
        hasSocial ? "social link found" : "social link not found",
        needsReview ? "needs review" : ""
      ]
        .filter(Boolean)
        .join("; "),
      contactConfidence,
      enrichmentStatus: needsReview ? ("needs_review" as const) : ("completed" as const),
      status: "enriched" as const
    };
  });

  return {
    companies,
    ...completeNode(state, "mergeEvidence", `Merged evidence for ${companies.length} companies.`)
  };
}
