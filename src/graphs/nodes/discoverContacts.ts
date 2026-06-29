import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { searchAggregationService } from "@/services/searchAggregationService";

export async function discoverContacts(state: LeadGenerationGraphState) {
  const errors: string[] = [];
  const companies = await Promise.all(
    state.companies.map(async (company) => {
      const aggregation = await searchAggregationService.searchCompanyContacts({
        companyName: company.name,
        country: company.country,
        website: company.website
      });
      errors.push(...aggregation.errors.map((error) => `${company.name}: ${error}`));

      const email = aggregation.contacts.find((contact) => contact.type === "email");
      const phone = aggregation.contacts.find((contact) => contact.type === "phone");
      const whatsapp = aggregation.websiteWhatsapps[0] ?? aggregation.contacts.find((contact) => contact.type === "whatsapp");
      const linkedin = aggregation.contacts.find((contact) => contact.type === "linkedin");
      const facebook = aggregation.contacts.find((contact) => contact.type === "facebook");
      const contactStatus = resolveContactStatus({
        hasEmail: Boolean(email),
        hasPhone: Boolean(phone),
        hasWhatsapp: Boolean(whatsapp),
        hasSocial: Boolean(linkedin || facebook)
      });

      return {
        ...company,
        emails: email ? [email.value] : company.emails,
        phone: phone?.value ?? company.phone,
        whatsapp: whatsapp?.value ?? company.whatsapp,
        linkedin: linkedin?.value ?? company.linkedin,
        facebook: facebook?.value ?? company.facebook,
        contactStatus,
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

  return {
    companies,
    errors: [...state.errors, ...errors],
    ...completeNode(state, "discoverContacts", `Discovered contacts for ${companies.length} companies.`)
  };
}

function resolveContactStatus(input: {
  hasEmail: boolean;
  hasPhone: boolean;
  hasWhatsapp: boolean;
  hasSocial: boolean;
}) {
  const foundCount =
    (input.hasEmail ? 1 : 0) +
    (input.hasPhone ? 1 : 0) +
    (input.hasWhatsapp ? 1 : 0) +
    (input.hasSocial ? 1 : 0);

  if (foundCount === 0) return "not_found" as const;
  if (foundCount < 2) return "partial" as const;
  return "found" as const;
}
