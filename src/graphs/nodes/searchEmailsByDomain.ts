import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import {
  classifyEmail,
  emailDomainMatchesSource,
  emailDomainMatchesWebsite,
  isFreeEmailDomain,
  normalizeEmail
} from "@/services/contactNormalizeService";
import { searchAggregationService } from "@/services/searchAggregationService";
import type { ContactSearchResult } from "@/types";

export async function searchEmailsByDomain(state: LeadGenerationGraphState) {
  const searchErrors: string[] = [];
  const companies = await Promise.all(
    state.companies.map(async (company) => {
      const aggregation = await searchAggregationService.searchCompanyContacts({
        companyName: company.name,
        country: company.country,
        website: company.website
      });
      searchErrors.push(...aggregation.errors.map((error) => `${company.name}: ${error}`));

      const emailContacts = rankEmailContacts(
        aggregation.contacts.filter((contact) => contact.type === "email"),
        company.website
      );
      const emails = Array.from(new Set(emailContacts.map((contact) => contact.value)));

      return {
        ...company,
        emails,
        evidence: [
          ...company.evidence,
          ...emailContacts.map((contact) => ({
            type: "contact_search" as const,
            title: `Email candidate from ${contact.sourceProvider}`,
            url: contact.sourceUrl,
            snippet: contact.evidenceText,
            source: contact.sourceProvider,
            rawText: contact.value,
            confidence: contact.confidence
          })),
          ...(emailContacts.length === 0
            ? [
                {
                  type: "email_search" as const,
                  title: "Email not found in public search",
                  url: company.website,
                  snippet:
                    "No public email was found in SearchProviderRouter results; no pattern email was generated.",
                  source: "product_search",
                  rawText: "",
                  confidence: 0.2
                }
              ]
            : [])
        ]
      };
    })
  );

  return {
    companies,
    errors: [...state.errors, ...searchErrors],
    ...completeNode(
      state,
      "searchEmailsByDomain",
      `Searched public contact results for emails across ${companies.length} domains.`
    )
  };
}

function rankEmailContacts(contacts: ContactSearchResult[], website: string | undefined) {
  return contacts
    .flatMap((contact) => {
      const email = normalizeEmail(contact.value);
      if (!email) return [];

      const quality = classifyEmail(email);
      const confidence = scoreEmailContact(contact, email, website, quality);
      if (confidence < 0.45) return [];
      if (quality === "low" && confidence < 0.7) return [];
      if (isFreeEmailDomain(email) && confidence < 0.76) return [];

      return [
        {
          ...contact,
          value: email,
          confidence
        }
      ];
    })
    .sort((a, b) => b.confidence - a.confidence);
}

function scoreEmailContact(
  contact: ContactSearchResult,
  email: string,
  website: string | undefined,
  quality: ReturnType<typeof classifyEmail>
) {
  let confidence = contact.confidence;
  if (quality === "high") confidence += 0.16;
  if (quality === "low") confidence -= 0.2;
  if (emailDomainMatchesWebsite(email, website)) confidence += 0.16;
  if (emailDomainMatchesSource(email, contact.sourceUrl)) confidence += 0.1;
  if (isFreeEmailDomain(email)) confidence -= 0.18;
  if (/(purchase|procurement|purchasing|sourcing|compras|sales|export|contact)/i.test(contact.evidenceText)) {
    confidence += 0.05;
  }
  return Math.max(0.2, Math.min(0.98, confidence));
}
