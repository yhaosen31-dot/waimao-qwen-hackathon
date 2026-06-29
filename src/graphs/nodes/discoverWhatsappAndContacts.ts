import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { searchAggregationService } from "@/services/searchAggregationService";

export async function discoverWhatsappAndContacts(state: LeadGenerationGraphState) {
  const searchErrors: string[] = [];
  const companies = await Promise.all(
    state.companies.map(async (company) => {
      const aggregation = await searchAggregationService.searchCompanyContacts({
        companyName: company.name,
        country: company.country,
        website: company.website
      });
      searchErrors.push(...aggregation.errors.map((error) => `${company.name}: ${error}`));

      const phone = aggregation.phones[0];
      const whatsapp = aggregation.websiteWhatsapps[0] ?? aggregation.whatsapps[0];
      const linkedin = aggregation.linkedins[0];
      const facebook = aggregation.facebooks[0];

      return {
        ...company,
        contactName: company.contactName ?? "Evidence-based Contact",
        contactTitle: company.contactTitle ?? "Procurement / Import Contact",
        phone: phone?.value ?? company.phone,
        whatsapp: whatsapp?.value ?? company.whatsapp,
        linkedin: linkedin?.value,
        facebook: facebook?.value,
        evidence: [
          ...company.evidence,
          ...aggregation.evidence.map((item) => ({
            type: item.type,
            title: item.title,
            url: item.url,
            snippet: item.snippet,
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
    "discoverWhatsappAndContacts",
    `Discovered evidence-based contacts and WhatsApp candidates for ${companies.length} companies.`
  );

  return {
    companies,
    errors: [...state.errors, ...searchErrors],
    ...completed
  };
}
