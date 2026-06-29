import type { LeadCandidate } from "@/graphs/state";
import {
  extractDomain,
  isThirdPartyDirectory,
  normalizeWebsiteUrl
} from "@/services/domainNormalizeService";
import { matchesExcludedCountryText } from "@/services/searchQueryBuilder";
import type { SearchResult } from "@/types";

export interface SearchResultExtractorInput {
  result: SearchResult;
  productName: string;
  sourceQuery: string;
  sourceProvider: string;
  excludedCountries?: string[];
}

export function extractCandidateCompaniesFromSearchResult(
  input: SearchResultExtractorInput
): LeadCandidate[] {
  if (input.result.sourceProvider === "mock" || input.sourceProvider === "mock") return [];
  if (!isValidCompanyResult(input.result, input.productName)) return [];
  if (
    matchesExcludedCountryText(
      `${input.result.title} ${input.result.url} ${input.result.snippet}`,
      input.excludedCountries ?? []
    )
  ) {
    return [];
  }

  const website = normalizeWebsiteUrl(input.result.url);
  const domain = extractDomain(website);
  const confidence = scoreProductSearchCandidate(input.result, input.productName);
  if (!domain || confidence < 0.45) return [];

  const companyName = cleanCompanyName(input.result.title, input.result.url, input.productName);

  return [
    {
      companyName,
      country: inferCountry(input.result),
      city: "",
      website,
      products: [input.productName],
      importerProfile:
        input.result.snippet || `${companyName} matched product-search query ${input.sourceQuery}.`,
      matchedKeyword: input.sourceQuery,
      sourceUrl: input.result.url,
      sourceProvider: input.sourceProvider,
      evidenceText: input.result.snippet || input.result.title,
      confidence
    }
  ];
}

function isValidCompanyResult(result: SearchResult, productName: string) {
  const url = normalizeWebsiteUrl(result.url);
  const domain = extractDomain(url);
  const text = `${result.title} ${result.url} ${result.snippet}`.toLowerCase();

  if (!url || !domain) return false;
  if (isThirdPartyDirectory(url)) return false;
  if (/\.(pdf|docx?|xlsx?|pptx?)(\?|$)/i.test(result.url)) return false;
  if (/google|bing|yahoo|duckduckgo|search results|images/i.test(result.title)) return false;
  if (/wikipedia|youtube|instagram|twitter|x\.com|reddit|pinterest/i.test(domain)) return false;
  if (/news|blog|article|jobs|career|forum|wiki/i.test(text)) return false;
  return hasAnyProductToken(text, productName);
}

function scoreProductSearchCandidate(result: SearchResult, productName: string) {
  const text = `${result.title} ${result.url} ${result.snippet}`.toLowerCase();
  let score = result.confidence;

  if (/importer|import|distributor|dealer|supplier|trading|wholesale|spare parts|service|repair|maintenance/i.test(text)) {
    score += 0.14;
  }
  if (/contact|about|company|profile/i.test(text)) score += 0.06;
  if (/manufacturer|factory/i.test(text)) score -= 0.05;
  if (/catalog|product page|datasheet|manual/i.test(text)) score -= 0.08;
  if (hasAnyProductToken(text, productName)) score += 0.08;
  if (isThirdPartyDirectory(result.url)) score -= 0.25;

  return Math.max(0.2, Math.min(0.98, score));
}

function hasAnyProductToken(text: string, productName: string) {
  return productName
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4)
    .some((token) => text.includes(token));
}

function cleanCompanyName(title: string, url: string, productName: string) {
  const cleanedTitle = title
    .replace(/\b(official website|homepage|home page|contact us|about us|products?|catalog|supplier|dealer|distributor)\b/gi, "")
    .split(/\s[-|]\s/)
    .map((part) => part.trim())
    .find((part) => part.length >= 3 && !looksLikeProductPhrase(part, productName));

  if (cleanedTitle) return cleanedTitle.slice(0, 120);

  const domain = extractDomain(url) || "unknown-company.com";
  const base = domain.split(".")[0] ?? "unknown-company";
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 120);
}

function looksLikeProductPhrase(value: string, productName: string) {
  const normalized = value.toLowerCase();
  const productTokens = productName
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4);
  const tokenMatches = productTokens.filter((token) => normalized.includes(token)).length;
  return tokenMatches >= Math.max(1, Math.floor(productTokens.length * 0.6));
}

function inferCountry(result: SearchResult) {
  const text = `${result.title} ${result.url} ${result.snippet}`.toLowerCase();
  const domain = extractDomain(result.url) ?? "";

  if (/\busa\b|united states|\.us\b/.test(text) || domain.endsWith(".us")) return "United States";
  if (/mexico|\.mx\b/.test(text) || domain.endsWith(".mx")) return "Mexico";
  if (/peru|\.pe\b/.test(text) || domain.endsWith(".pe")) return "Peru";
  if (/brazil|brasil|\.br\b/.test(text) || domain.endsWith(".br")) return "Brazil";
  if (/colombia|\.co\b/.test(text) || domain.endsWith(".co")) return "Colombia";
  if (/chile|\.cl\b/.test(text) || domain.endsWith(".cl")) return "Chile";
  if (/argentina|\.ar\b/.test(text) || domain.endsWith(".ar")) return "Argentina";
  if (/canada|\.ca\b/.test(text) || domain.endsWith(".ca")) return "Canada";
  if (/united kingdom|\buk\b|\.uk\b/.test(text) || domain.endsWith(".uk")) return "United Kingdom";

  return "Unknown";
}
