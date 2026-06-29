import { completeNode, type GraphCompany, type LeadGenerationGraphState } from "@/graphs/state";
import type { SearchProviderName } from "@/types";

export async function extractCompanyDetails(state: LeadGenerationGraphState) {
  const companies: GraphCompany[] = state.candidates.map((candidate, index) => {
    const domain = candidate.website ? domainFromWebsite(candidate.website) : "";

    return {
      id: `company_${state.runId}_${index + 1}`,
      name: candidate.companyName,
      country: candidate.country,
      city: candidate.city,
      website: candidate.website ?? "",
      domain,
      products: candidate.products,
      importerProfile: candidate.importerProfile,
      sourceKeyword: candidate.matchedKeyword,
      sourceQuery: candidate.matchedKeyword,
      sourceProvider: normalizeSearchProvider(candidate.sourceProvider),
      source: "product_search",
      status: "product_search_candidate",
      enrichmentStatus: "pending",
      websiteStatus: candidate.website ? "found" : "not_started",
      contactStatus: "not_started",
      emails: [],
      buyerFitReasons: [],
      evidence: [
        {
          type: "product_search",
          title: `${candidate.companyName} product-search match`,
          url: candidate.sourceUrl ?? candidate.website,
          snippet:
            candidate.evidenceText ??
            `Matched keyword "${candidate.matchedKeyword}" from product search seed data.`,
          source: candidate.sourceProvider ?? "product_search",
          rawText: candidate.importerProfile,
          confidence: candidate.confidence ?? 0.86
        }
      ]
    };
  });

  return {
    companies,
    ...completeNode(
      state,
      "extractCompanyDetails",
      `Extracted product-search details for ${companies.length} companies.`
    )
  };
}

function domainFromWebsite(website: string) {
  return website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function normalizeSearchProvider(value: string | undefined): SearchProviderName | undefined {
  return value === "exa" || value === "tavily" || value === "you" || value === "mock"
    ? value
    : undefined;
}
