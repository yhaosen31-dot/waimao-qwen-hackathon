import { completeNode, type GraphCompany, type LeadGenerationGraphState } from "@/graphs/state";

export async function extractCompanyDetails(state: LeadGenerationGraphState) {
  const companies: GraphCompany[] = state.candidates.map((candidate, index) => {
    const domain = candidate.website ? domainFromWebsite(candidate.website) : mockDomain(candidate.companyName);

    return {
      id: `company_${state.runId}_${index + 1}`,
      name: candidate.companyName,
      country: candidate.country,
      city: candidate.city,
      website: candidate.website ?? `https://www.${domain}`,
      domain,
      products: candidate.products,
      importerProfile: candidate.importerProfile,
      sourceKeyword: candidate.matchedKeyword,
      emails: [],
      buyerFitReasons: [],
      evidence: [
        {
          type: "cross_search_mock",
          title: `${candidate.companyName} importer match`,
          url: candidate.website,
          snippet: `Matched keyword "${candidate.matchedKeyword}" from mock cross-border search.`,
          rawText: candidate.importerProfile,
          confidence: 0.86
        }
      ]
    };
  });

  return {
    companies,
    ...completeNode(
      state,
      "extractCompanyDetails",
      `Extracted mock details for ${companies.length} companies.`
    )
  };
}

function domainFromWebsite(website: string) {
  return website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function mockDomain(companyName: string) {
  return `${companyName
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 28)}.com`;
}
