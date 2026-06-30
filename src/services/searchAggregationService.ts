import type { CompanyContactSearchInput, CompanyWebsiteSearchInput } from "@/providers/exaProvider";
import { contentModelProvider } from "@/providers/contentModelProvider";
import { searchProviderRouter } from "@/services/searchProviderRouter";
import { discoverPublicWebsiteWhatsapps } from "@/services/whatsappDiscoveryService";
import type { ContactSearchResult, SearchResult } from "@/types";

export interface AggregatedWebsiteWhatsapp {
  type: "whatsapp";
  value: string;
  sourceUrl: string;
  sourceProvider: "website_search";
  confidence: number;
  evidenceText: string;
  raw?: unknown;
}

export interface SearchAggregationResult {
  websiteCandidates: SearchResult[];
  contacts: ContactSearchResult[];
  phones: ContactSearchResult[];
  whatsapps: ContactSearchResult[];
  websiteWhatsapps: AggregatedWebsiteWhatsapp[];
  linkedins: ContactSearchResult[];
  facebooks: ContactSearchResult[];
  evidence: Array<{
    type: "website_search" | "email_search" | "phone_search" | "whatsapp_search" | "social_search";
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
    const routed = await runWebsiteSearch(input);
    const websiteCandidates = dedupeSearchResults(
      routed.websiteResults.filter((result) => result.sourceProvider !== "mock")
    ).sort(
      (a, b) => b.confidence - a.confidence
    );
    const evidence = websiteCandidates.map((result) => ({
      type: "website_search" as const,
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
      websiteWhatsapps: [],
      linkedins: [],
      facebooks: [],
      evidence,
      errors: routed.errors,
      mode: aggregateMode()
    };
  },

  async searchCompanyContacts(input: CompanyContactSearchInput): Promise<SearchAggregationResult> {
    const [routed, publicWebsiteWhatsapps] = await Promise.all([
      runContactSearch(input),
      discoverPublicWebsiteWhatsapps({
        companyName: input.companyName,
        country: input.country,
        website: input.website
      })
    ]);
    const contacts = dedupeContacts(
      routed.contactResults.filter((result) => result.sourceProvider !== "mock")
    ).sort((a, b) => b.confidence - a.confidence);
    const websiteWhatsapps: AggregatedWebsiteWhatsapp[] = publicWebsiteWhatsapps.map((candidate) => ({
      type: "whatsapp",
      value: candidate.number,
      sourceUrl: candidate.sourceUrl,
      sourceProvider: "website_search",
      confidence: candidate.confidence,
      evidenceText: candidate.evidenceText,
      raw: candidate
    }));
    const evidence = [
      ...contacts.map((contact) => ({
        type: contactEvidenceType(contact.type),
        title: `${contact.type} candidate from ${contact.sourceProvider}`,
        url: contact.sourceUrl,
        snippet: contact.evidenceText,
        rawText: `${contact.type}: ${contact.value}. ${contact.evidenceText}`,
        confidence: contact.confidence,
        source: contact.sourceProvider,
        raw: contact.raw
      })),
      ...websiteWhatsapps.map((candidate) => ({
        type: "whatsapp_search" as const,
        title: "WhatsApp candidate from public website",
        url: candidate.sourceUrl,
        snippet: candidate.evidenceText,
        rawText: `whatsapp: ${candidate.value}. ${candidate.evidenceText}`,
        confidence: candidate.confidence,
        source: candidate.sourceProvider,
        raw: candidate.raw
      }))
    ];

    return {
      websiteCandidates: [],
      contacts,
      phones: contacts.filter((contact) => contact.type === "phone"),
      whatsapps: contacts.filter((contact) => contact.type === "whatsapp"),
      websiteWhatsapps,
      linkedins: contacts.filter((contact) => contact.type === "linkedin"),
      facebooks: contacts.filter((contact) => contact.type === "facebook"),
      evidence,
      errors: routed.errors,
      mode: aggregateMode()
    };
  },

  statuses() {
    return searchProviderRouter.statuses();
  },

  async testProviders() {
    await searchProviderRouter.search({
      query: "diaphragm accumulator official website",
      searchType: "website",
      mode: "economy",
      websiteInput: {
        companyName: "diaphragm accumulator",
        sourceKeyword: "diaphragm accumulator"
      }
    });

    return this.statuses();
  }
};

async function runWebsiteSearch(input: CompanyWebsiteSearchInput) {
  const fallbackQuery = `${input.companyName} official website ${input.country ?? ""} ${input.sourceKeyword ?? ""}`.trim();
  const toolSearch = await contentModelProvider.searchWithTools({
    objective: "Find official website candidates for this company/product-search lead.",
    context: {
      companyName: input.companyName,
      country: input.country,
      sourceKeyword: input.sourceKeyword
    },
    defaultSearchType: "website",
    mode: "fallback",
    maxToolCalls: 2,
    minResults: 1,
    minConfidence: 0.58
  });
  const websiteResults = toolSearch.toolCalls.flatMap((call) => call.result.websiteResults);

  if (websiteResults.length > 0) {
    return {
      websiteResults,
      errors: toolSearch.toolCalls.flatMap((call) => [
        ...call.result.errors,
        ...call.result.attempts.flatMap((attempt) => attempt.errorMessage ?? [])
      ])
    };
  }

  const routed = await searchProviderRouter.search({
    query: fallbackQuery,
    searchType: "website",
    mode: "fallback",
    websiteInput: input,
    minResults: 1,
    minConfidence: 0.58
  });

  return {
    websiteResults: routed.websiteResults,
    errors: [
      ...routed.errors,
      ...routed.attempts.flatMap((attempt) => attempt.errorMessage ?? []),
      ...(toolSearch.fallbackReason ? [toolSearch.fallbackReason] : [])
    ]
  };
}

function contactEvidenceType(type: ContactSearchResult["type"]) {
  if (type === "email") return "email_search" as const;
  if (type === "phone") return "phone_search" as const;
  if (type === "whatsapp") return "whatsapp_search" as const;
  if (type === "linkedin" || type === "facebook") return "social_search" as const;
  return "phone_search" as const;
}

async function runContactSearch(input: CompanyContactSearchInput) {
  const toolSearch = await contentModelProvider.searchWithTools({
    objective: "Find public contact evidence for this company: email, phone, WhatsApp, LinkedIn, and Facebook.",
    context: {
      companyName: input.companyName,
      country: input.country,
      website: input.website
    },
    defaultSearchType: "contact",
    mode: "fallback",
    maxToolCalls: 3,
    minResults: 1,
    minConfidence: 0.5
  });
  const contactResults: ContactSearchResult[] = [
    ...toolSearch.toolCalls.flatMap((call) => call.result.contactResults)
  ];
  const errors = toolSearch.toolCalls.flatMap((call) => [
    ...call.result.errors,
    ...call.result.attempts.flatMap((attempt) => attempt.errorMessage ?? [])
  ]);

  for (const query of buildAggregationContactQueries(input)) {
    if (hasEnoughAggregationContacts(contactResults)) break;

    const routed = await searchProviderRouter.search({
      query: query.query,
      searchType: query.searchType,
      mode: "fallback",
      contactInput: input,
      minResults: query.minResults,
      minConfidence: query.minConfidence
    });
    contactResults.push(...routed.contactResults);
    errors.push(
      ...routed.errors,
      ...routed.attempts.flatMap((attempt) => attempt.errorMessage ?? [])
    );
  }

  return {
    contactResults: dedupeContacts(contactResults),
    errors: [
      ...errors,
      ...(toolSearch.fallbackReason ? [toolSearch.fallbackReason] : [])
    ]
  };
}

function buildAggregationContactQueries(input: CompanyContactSearchInput) {
  const domain = input.website?.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  const queries = [
    {
      query: `${input.companyName} contact email phone ${input.country ?? ""}`.trim(),
      searchType: "contact" as const,
      minResults: 1,
      minConfidence: 0.55
    },
    {
      query: `${input.companyName} procurement purchasing sourcing email ${input.country ?? ""}`.trim(),
      searchType: "email" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `${input.companyName} compras ventas email contacto ${input.country ?? ""}`.trim(),
      searchType: "email" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `${input.companyName} WhatsApp phone contact ${input.country ?? ""}`.trim(),
      searchType: "whatsapp" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `${input.companyName} WhatsApp ventas compras ${input.country ?? ""}`.trim(),
      searchType: "whatsapp" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `${input.companyName} LinkedIn Facebook ${input.country ?? ""}`.trim(),
      searchType: "social" as const,
      minResults: 0,
      minConfidence: 0.5
    }
  ];

  if (!domain) return queries;

  return [
    {
      query: `${domain} contact email`,
      searchType: "email" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `site:${domain} contact email`,
      searchType: "email" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    ...queries
  ];
}

function hasEnoughAggregationContacts(contactResults: ContactSearchResult[]) {
  const hasEmail = contactResults.some((result) => result.type === "email");
  const hasWhatsapp = contactResults.some((result) => result.type === "whatsapp");
  const hasSocial = contactResults.some((result) => result.type === "linkedin" || result.type === "facebook");

  return hasEmail && hasWhatsapp && hasSocial;
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
  const statuses = Object.values(searchProviderRouter.statuses());
  const modes = statuses.map((status) => status.mode);
  if (modes.every((mode) => mode === "mock")) return "mock";
  if (modes.every((mode) => mode === "real")) return "real";
  return "mixed";
}
