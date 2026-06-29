import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { searchAggregationService } from "@/services/searchAggregationService";

export async function discoverWebsite(state: LeadGenerationGraphState) {
  const searchErrors: string[] = [];
  const companies = await Promise.all(
    state.companies.map(async (company) => {
      const aggregation = await searchAggregationService.searchCompanyWebsite({
        companyName: company.name,
        country: company.country,
        sourceKeyword: company.sourceKeyword
      });
      searchErrors.push(...aggregation.errors.map((error) => `${company.name}: ${error}`));

      const bestWebsite = aggregation.websiteCandidates[0];
      const hasHighConfidenceSingle =
        aggregation.websiteCandidates.length === 1 && bestWebsite && bestWebsite.confidence >= 0.8;
      const nextWebsite =
        hasHighConfidenceSingle || (bestWebsite && bestWebsite.confidence >= 0.86)
          ? bestWebsite.url
          : company.website;
      const websiteStatus =
        bestWebsite && !hasHighConfidenceSingle && bestWebsite.confidence < 0.86
          ? ("needs_review" as const)
          : nextWebsite
            ? ("found" as const)
            : ("not_found" as const);

      return {
        ...company,
        website: nextWebsite,
        domain: nextWebsite ? domainFromWebsite(nextWebsite) : company.domain,
        websiteStatus,
        enrichmentStatus: websiteStatus === "needs_review" ? ("needs_review" as const) : company.enrichmentStatus,
        evidence: [
          ...company.evidence,
          ...aggregation.evidence.map((item) => ({
            type: item.type,
            title: item.title,
            url: item.url,
            snippet:
              bestWebsite && !hasHighConfidenceSingle && bestWebsite.confidence < 0.86
                ? `${item.snippet} Multiple website candidates found; marked for later review.`
                : item.snippet,
            source: item.source,
            rawText: item.rawText,
            confidence: item.confidence
          })),
          ...(bestWebsite || company.website
            ? []
            : [
                {
                  type: "website_not_found" as const,
                  title: "Website not found",
                  snippet:
                    "No official website was found in SearchProviderRouter results; no synthetic website was generated.",
                  source: "product_search",
                  rawText: "",
                  confidence: 0.2
                }
              ])
        ]
      };
    })
  );
  const completed = completeNode(
    state,
    "discoverWebsite",
    `Completed ${searchAggregationService.statuses().exa.mode}/${searchAggregationService.statuses().tavily.mode}/${searchAggregationService.statuses().you.mode} website discovery for ${companies.length} companies.`
  );

  return {
    companies,
    errors: [...state.errors, ...searchErrors],
    ...completed
  };
}

function domainFromWebsite(website: string) {
  return website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}
