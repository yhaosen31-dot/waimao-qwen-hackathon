import { exaProvider, type CompanyContactSearchInput, type CompanyWebsiteSearchInput } from "@/providers/exaProvider";
import { tavilyProvider } from "@/providers/tavilyProvider";
import { youProvider } from "@/providers/youProvider";
import type { ContactSearchResult, SearchResult } from "@/types";

const providers = [exaProvider, tavilyProvider, youProvider];

export interface SearchAggregationResult {
  websiteCandidates: SearchResult[];
  contacts: ContactSearchResult[];
  phones: ContactSearchResult[];
  whatsapps: ContactSearchResult[];
  linkedins: ContactSearchResult[];
  facebooks: ContactSearchResult[];
  evidence: Array<{
    type: "website_mock" | "website_search" | "whatsapp_mock" | "contact_search";
    title: string;
    url?: string;
    snippet: string;
    rawText: string;
    confidence: number;
    source: string;
    raw?: unknown;
  }>;
  errors: string[];
  mode: "mock" | "real" | "mixed";
}

export const searchAggregationService = {
  async searchCompanyWebsite(input: CompanyWebsiteSearchInput): Promise<SearchAggregationResult> {
    const settled = await Promise.allSettled(
      providers.map((provider) => provider.searchCompanyWebsite(input))
    );
    const errors = [...collectProviderErrors(settled, "website"), ...providerFallbackErrors()];
    const websiteCandidates = dedupeSearchResults(settled.flatMap(valueOrEmpty)).sort(
      (a, b) => b.confidence - a.confidence
    );
    const evidence = websiteCandidates.map((result) => ({
      type: result.sourceProvider === "mock" ? ("website_mock" as const) : ("website_search" as const),
      title: `Website candidate from ${result.sourceProvider}`,
      url: result.url,
      snippet: result.snippet,
      rawText: result.snippet || result.title,
      confidence: result.confidence,
      source: result.sourceProvider,
      raw: result.raw
    }));

    return {
      websiteCandidates,
      contacts: [],
      phones: [],
      whatsapps: [],
      linkedins: [],
      facebooks: [],
      evidence,
      errors,
      mode: aggregateMode()
    };
  },

  async searchCompanyContacts(input: CompanyContactSearchInput): Promise<SearchAggregationResult> {
    const [contactsSettled, whatsappSettled, socialSettled] = await Promise.all([
      Promise.allSettled(providers.map((provider) => provider.searchCompanyContacts(input))),
      Promise.allSettled(providers.map((provider) => provider.searchWhatsapp(input))),
      Promise.allSettled(
        providers.map((provider) =>
          provider.searchLinkedinFacebook({
            companyName: input.companyName,
            country: input.country
          })
        )
      )
    ]);
    const contacts = dedupeContacts([
      ...contactsSettled.flatMap(valueOrEmpty),
      ...whatsappSettled.flatMap(valueOrEmpty),
      ...socialSettled.flatMap(valueOrEmpty)
    ]).sort((a, b) => b.confidence - a.confidence);
    const evidence = contacts.map((contact) => ({
      type:
        contact.type === "whatsapp" && contact.sourceProvider === "mock"
          ? ("whatsapp_mock" as const)
          : ("contact_search" as const),
      title: `${contact.type} candidate from ${contact.sourceProvider}`,
      url: contact.sourceUrl,
      snippet: contact.evidenceText,
      rawText: `${contact.type}: ${contact.value}. ${contact.evidenceText}`,
      confidence: contact.confidence,
      source: contact.sourceProvider,
      raw: contact.raw
    }));

    return {
      websiteCandidates: [],
      contacts,
      phones: contacts.filter((contact) => contact.type === "phone"),
      whatsapps: contacts.filter((contact) => contact.type === "whatsapp"),
      linkedins: contacts.filter((contact) => contact.type === "linkedin"),
      facebooks: contacts.filter((contact) => contact.type === "facebook"),
      evidence,
      errors: [
        ...collectProviderErrors(contactsSettled, "contacts"),
        ...collectProviderErrors(whatsappSettled, "whatsapp"),
        ...collectProviderErrors(socialSettled, "social"),
        ...providerFallbackErrors()
      ],
      mode: aggregateMode()
    };
  },

  statuses() {
    return Object.fromEntries(
      providers.map((provider) => {
        const status = provider.status();

        return [
          provider.name,
          {
            configured: status.configured,
            ok: !status.lastError,
            mode: status.mode,
            lastError: status.lastError
          }
        ];
      })
    );
  },

  async testProviders() {
    await Promise.allSettled(
      providers.map((provider) =>
        provider.searchCompanyWebsite({
          companyName: "diaphragm accumulator",
          sourceKeyword: "diaphragm accumulator"
        })
      )
    );

    return this.statuses();
  }
};

function valueOrEmpty<T>(settled: PromiseSettledResult<T[]>): T[] {
  return settled.status === "fulfilled" ? settled.value : [];
}

function collectProviderErrors<T>(settled: PromiseSettledResult<T[]>[], area: string) {
  return settled.flatMap((item) =>
    item.status === "rejected" ? [`${area}: ${item.reason}`] : []
  );
}

function providerFallbackErrors() {
  return providers.flatMap((provider) => {
    const status = provider.status();
    return status.lastError ? [`${provider.name}: ${status.lastError}`] : [];
  });
}

function dedupeSearchResults(results: SearchResult[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = normalizeUrl(result.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeContacts(results: ContactSearchResult[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = `${result.type}:${result.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
}

function aggregateMode(): "mock" | "real" | "mixed" {
  const modes = providers.map((provider) => provider.status().mode);
  if (modes.every((mode) => mode === "mock")) return "mock";
  if (modes.every((mode) => mode === "real")) return "real";
  return "mixed";
}
