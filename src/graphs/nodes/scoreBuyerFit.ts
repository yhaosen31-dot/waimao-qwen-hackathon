import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { contentModelProvider } from "@/providers/contentModelProvider";
import type { ContentModelProviderName } from "@/providers/minimaxProvider";

export async function scoreBuyerFit(state: LeadGenerationGraphState) {
  const companies = await Promise.all(
    state.companies.map(async (company) => {
      if (
        company.enrichmentStatus &&
        !["completed", "needs_review"].includes(company.enrichmentStatus)
      ) {
        return company;
      }

      const evidenceSummary =
        company.evidenceSummary ??
        company.evidence
          .map((item) => `${item.type}: ${item.rawText ?? item.snippet}`)
          .slice(0, 12)
          .join("\n");
      const score = await contentModelProvider.scoreBuyerFit({
        companyId: company.id,
        companyName: company.name,
        country: company.country,
        source: "product_search",
        productName: state.normalizedProduct ?? state.productInput,
        productDescription: company.productDescription ?? company.products.join(", "),
        transactionSummary: company.transactionSummary,
        website: company.website,
        domain: company.domain,
        emails: company.emails,
        phones: company.phone ? [company.phone] : [],
        whatsappNumbers: company.whatsapp ? [company.whatsapp] : [],
        linkedin: company.linkedin,
        facebook: company.facebook,
        evidenceSummary,
        contactConfidence: company.contactConfidence
      });

      return {
        ...company,
        buyerFitTier: score.buyerFit,
        companyRole: score.companyRole,
        buyerFitScore: score.leadScore,
        leadScore: score.leadScore,
        confidence: score.confidence,
        suggestedAction: score.suggestedAction,
        buyerFitReasons: score.reasons,
        buyerFitRisks: score.risks,
        status: "scored" as const,
        evidence: [
          ...company.evidence,
          {
            type: "buyer_fit" as const,
            title: `Buyer Fit ${score.buyerFit} via ${score.provider ?? contentModelProvider.name}`,
            url: company.website,
            snippet: score.reasons.join("; "),
            source: contentEvidenceSource(score.provider),
            rawText: [
              `provider=${score.provider ?? contentModelProvider.name}`,
              `buyerFit=${score.buyerFit}`,
              `companyRole=${score.companyRole}`,
              `leadScore=${score.leadScore}`,
              `suggestedAction=${score.suggestedAction}`,
              `reasons=${score.reasons.join("; ")}`,
              `risks=${score.risks.join("; ")}`,
              score.fallbackReason ? `fallback=${score.fallbackReason}` : ""
            ]
              .filter(Boolean)
              .join("\n"),
            confidence: score.confidence
          }
        ]
      };
    })
  );
  const scoredCount = companies.filter((company) => company.buyerFitTier).length;

  return {
    companies,
    ...completeNode(
      state,
      "scoreBuyerFit",
      `Scored Buyer Fit for ${scoredCount} companies via ${contentModelProvider.name}.`
    )
  };
}

function contentEvidenceSource(provider: ContentModelProviderName | undefined) {
  if (provider === "qwen" || provider === "minimax") return provider;
  return "mock";
}
