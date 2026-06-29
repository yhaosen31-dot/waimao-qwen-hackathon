import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";

export async function enrichCompanies(state: LeadGenerationGraphState) {
  return {
    companies: state.companies.map((company) => ({
      ...company,
      enrichmentStatus: "running" as const,
      status: company.status ?? ("product_search_candidate" as const),
      websiteStatus: company.website ? ("found" as const) : (company.websiteStatus ?? "not_started"),
      contactStatus: company.contactStatus ?? ("not_started" as const),
      evidence: company.evidence
    })),
    ...completeNode(
      state,
      "enrichCompanies",
      `Prepared ${state.companies.length} companies for website and contact enrichment.`
    )
  };
}
