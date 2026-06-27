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
          : company.website || `https://www.${company.domain}`;

      return {
        ...company,
        website: nextWebsite,
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
          }))
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
