import { contentModelProvider } from "@/providers/contentModelProvider";
import {
  searchProviderRouter,
  type RoutedSearchResult,
  type SearchProviderAttempt
} from "@/services/searchProviderRouter";
import {
  domainMatchesCompany,
  extractDomain,
  isThirdPartyDirectory,
  normalizeWebsiteUrl
} from "@/services/domainNormalizeService";
import type { EvidenceProvider, SaveEvidenceInput, SearchProviderName } from "@/types";

export interface WebsiteDiscoveryInput {
  companyId: string;
  importJobId?: string;
  runId: string;
  companyName: string;
  country?: string;
  productDescription?: string;
  transactionSummary?: string;
}

export interface WebsiteCandidate {
  website: string;
  domain: string;
  confidence: number;
  sourceProvider: SearchProviderName;
  sourceUrl: string;
  evidenceText: string;
  needsReview?: boolean;
}

export interface WebsiteDiscoveryResult {
  website?: string;
  domain?: string;
  confidence: number;
  needsReview: boolean;
  notFound: boolean;
  candidates: WebsiteCandidate[];
  evidence: SaveEvidenceInput[];
  providerAttempts: SearchProviderAttempt[];
}

export async function discoverCompanyWebsite(
  input: WebsiteDiscoveryInput
): Promise<WebsiteDiscoveryResult> {
  const queries = buildWebsiteQueries(input);
  const routed = await runWebsiteSearch(input, queries);
  const candidates = routed.websiteResults
    .filter((result) => result.sourceProvider !== "mock")
    .map((result) => {
      const website = normalizeWebsiteUrl(result.url);
      const domain = extractDomain(website);
      if (!website || !domain) return null;

      return {
        website,
        domain,
        confidence: scoreWebsiteCandidate({
          companyName: input.companyName,
          title: result.title,
          snippet: result.snippet,
          url: result.url,
          baseConfidence: result.confidence
        }),
        sourceProvider: routed.provider ?? result.sourceProvider,
        sourceUrl: result.url,
        evidenceText: result.snippet || result.title
      } satisfies WebsiteCandidate;
    })
    .filter((candidate): candidate is WebsiteCandidate => Boolean(candidate))
    .sort((a, b) => b.confidence - a.confidence);
  const officialCandidates = candidates.filter(
    (candidate) => candidate.confidence >= 0.58 && !isThirdPartyDirectory(candidate.website)
  );
  const top = officialCandidates[0];
  const second = officialCandidates[1];
  const needsReview = Boolean(
    top &&
      second &&
      second.domain !== top.domain &&
      second.confidence >= 0.64 &&
      top.confidence - second.confidence < 0.14
  );

  if (!top) {
    return {
      confidence: 0,
      needsReview: false,
      notFound: true,
      candidates,
      providerAttempts: routed.attempts,
      evidence: [
        {
          companyId: input.companyId,
          provider: (routed.provider ?? "website_search") as EvidenceProvider,
          sourceProvider: routed.provider,
          type: "website_not_found",
          source: routed.provider ?? "website_search",
          title: "Website not found",
          rawText: `No official website found for ${input.companyName}. Query: ${queries[0]}`,
          confidence: 0.35,
          raw: {
            query: queries[0],
            attempts: routed.attempts,
            toolUse: routed.toolUse
          }
        }
      ]
    };
  }

  return {
    website: needsReview ? undefined : top.website,
    domain: needsReview ? undefined : top.domain,
    confidence: top.confidence,
    needsReview,
    notFound: false,
    candidates: officialCandidates.map((candidate) => ({
      ...candidate,
      needsReview: needsReview && candidate.domain !== top.domain
    })),
    providerAttempts: routed.attempts,
    evidence: candidates.map<SaveEvidenceInput>((candidate) => ({
      companyId: input.companyId,
      provider: candidate.sourceProvider as EvidenceProvider,
      sourceProvider: candidate.sourceProvider,
      type: "website_search",
      source: candidate.sourceProvider,
      title: `Website candidate: ${candidate.domain}`,
      url: candidate.sourceUrl,
      rawText: candidate.evidenceText,
      confidence: candidate.confidence,
      raw: {
        query: routed.query,
        toolUse: routed.toolUse,
        candidate
      }
    }))
  };
}

type WebsiteSearchExecution = RoutedSearchResult & {
  toolUse?: {
    provider: string;
    finalText?: string;
    toolQueries: string[];
    fallbackReason?: string;
  };
};

async function runWebsiteSearch(
  input: WebsiteDiscoveryInput,
  queries: string[]
): Promise<WebsiteSearchExecution> {
  const toolSearch = await contentModelProvider.searchWithTools({
    objective: "Find the most likely official website for this company. Return evidence only from search_web results.",
    context: {
      companyName: input.companyName,
      country: input.country,
      productDescription: input.productDescription,
      transactionSummary: input.transactionSummary
    },
    defaultSearchType: "website",
    mode: "fallback",
    companyId: input.companyId,
    importJobId: input.importJobId,
    maxToolCalls: 2,
    minResults: 1,
    minConfidence: 0.58
  });
  const websiteResults = dedupeWebsiteResults(
    toolSearch.toolCalls.flatMap((call) => call.result.websiteResults)
  );

  if (websiteResults.length > 0) {
    return {
      query: toolSearch.toolCalls[0]?.query ?? queries[0],
      searchType: "website",
      mode: "fallback",
      provider: toolSearch.toolCalls.find((call) => call.result.provider)?.result.provider,
      websiteResults,
      contactResults: [],
      attempts: toolSearch.toolCalls.flatMap((call) => call.result.attempts),
      errors: toolSearch.toolCalls.flatMap((call) => call.result.errors),
      toolUse: {
        provider: toolSearch.provider,
        finalText: toolSearch.finalText,
        toolQueries: toolSearch.toolCalls.map((call) => call.query),
        fallbackReason: toolSearch.fallbackReason
      }
    };
  }

  const routed = await searchProviderRouter.search({
    query: queries[0],
    searchType: "website",
    mode: "fallback",
    companyId: input.companyId,
    importJobId: input.importJobId,
    websiteInput: {
      companyName: input.companyName,
      country: input.country,
      sourceKeyword: input.productDescription
    },
    minResults: 1,
    minConfidence: 0.58
  });

  return {
    ...routed,
    toolUse: toolSearch.fallbackReason
      ? {
          provider: toolSearch.provider,
          toolQueries: toolSearch.toolCalls.map((call) => call.query),
          fallbackReason: toolSearch.fallbackReason
        }
      : undefined
  };
}

function buildWebsiteQueries(input: WebsiteDiscoveryInput) {
  return [
    `${input.companyName} official website`,
    `${input.companyName} ${input.country ?? ""} contact`.trim(),
    `${input.companyName} company website`,
    `${input.companyName} ${input.productDescription ?? ""}`.trim()
  ];
}

function dedupeWebsiteResults<T extends { url: string }>(results: T[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = result.url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreWebsiteCandidate(input: {
  companyName: string;
  title: string;
  snippet: string;
  url: string;
  baseConfidence: number;
}) {
  const domain = extractDomain(input.url);
  let score = input.baseConfidence;

  if (domainMatchesCompany(domain, input.companyName)) score += 0.12;
  if (containsCompanyToken(input.title, input.companyName)) score += 0.08;
  if (/(contact|about|company|profile)/i.test(input.snippet)) score += 0.05;
  if (isThirdPartyDirectory(input.url)) score -= 0.2;

  return Math.max(0.2, Math.min(0.98, score));
}

function containsCompanyToken(text: string, companyName: string) {
  const normalizedText = text.toLowerCase();
  return companyName
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3)
    .some((token) => normalizedText.includes(token));
}
