import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { minimaxProvider } from "@/providers/minimaxProvider";

export async function scoreBuyerFit(state: LeadGenerationGraphState) {
  const companies = await Promise.all(
    state.companies.map(async (company, index) => {
      const evidenceSummary = company.evidence
        .map((item) => `${item.type}: ${item.rawText ?? item.snippet}`)
        .slice(0, 8)
        .join("\n");
      const providerResult = await minimaxProvider.invoke({
        productName: state.normalizedProduct ?? state.productInput,
        companyName: company.name,
        buyerSignals: company.evidence.map((item) => item.snippet).slice(0, 6),
        evidenceSummary
      });

      return {
        ...company,
        buyerFitScore: Math.min(96, 74 + (index % 6) * 4),
        leadScore: Math.min(98, 70 + (index % 7) * 4),
        confidence: 0.78 + (index % 4) * 0.04,
        buyerFitReasons: [
          "Product catalog overlaps with diaphragm accumulator demand.",
          "Importer profile suggests recurring industrial replacement-parts purchasing.",
          `Mock ${providerResult.provider} scoring considered ${company.products.length} product signals.`
        ],
        evidence: [
          ...company.evidence,
          {
            type: "buyer_fit_mock" as const,
            title: "Mock Buyer Fit score",
            url: company.website,
            snippet: `Buyer fit scored only from saved evidence and source keyword "${company.sourceKeyword}".`,
            rawText: evidenceSummary || providerResult.body,
            confidence: 0.83
          }
        ]
      };
    })
  );

  return {
    companies,
    ...completeNode(state, "scoreBuyerFit", `Scored ${companies.length} mock buyer profiles.`)
  };
}
