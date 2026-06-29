import { envFlag, type ExternalProvider, type ProviderFactoryOptions } from "@/providers/types";
import { fetchWithTimeout } from "@/providers/providerFetch";
import { normalizeEmail } from "@/services/contactNormalizeService";
import type { ContactSearchResult, SearchProviderName, SearchResult } from "@/types";

export interface CompanyWebsiteSearchInput {
  companyName: string;
  country?: string;
  sourceKeyword?: string;
}

export interface CompanyContactSearchInput {
  companyName: string;
  country?: string;
  website?: string;
}

export interface ProviderSearchMeta {
  provider: SearchProviderName;
  configured: boolean;
  mode: "mock" | "real";
  lastError?: string;
}

export interface SearchProviderMethods {
  searchCompanyWebsite(input: CompanyWebsiteSearchInput): Promise<SearchResult[]>;
  searchCompanyContacts(input: CompanyContactSearchInput): Promise<ContactSearchResult[]>;
  searchWhatsapp(input: CompanyContactSearchInput): Promise<ContactSearchResult[]>;
  searchLinkedinFacebook(input: CompanyWebsiteSearchInput): Promise<ContactSearchResult[]>;
  status(): ProviderSearchMeta;
}

export type ExaProvider = ExternalProvider<CompanyContactSearchInput, ContactSearchResult[]> &
  SearchProviderMethods;

export function createExaProvider(options: ProviderFactoryOptions = {}): ExaProvider {
  const isConfigured = envFlag(process.env.EXA_API_KEY);
  const mode = options.mode ?? (isConfigured ? "real" : "mock");
  let lastError: string | undefined;

  async function runSearch(query: string, fallbackUrl?: string): Promise<SearchResult[]> {
    void fallbackUrl;

    if (mode !== "real" || !isConfigured) {
      lastError = "EXA is not configured.";
      return [];
    }

    try {
      const response = await fetchWithTimeout(resolveProviderEndpoint(process.env.EXA_BASE_URL, "https://api.exa.ai", "search"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.EXA_API_KEY ?? ""
        },
        body: JSON.stringify({
          query,
          numResults: 5,
          contents: {
            highlights: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`EXA search failed with ${response.status}`);
      }

      const raw = (await response.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          highlights?: string[];
          text?: string;
          score?: number;
        }>;
      };

      lastError = undefined;
      return (raw.results ?? [])
        .filter((result) => result.url)
        .map((result) => ({
          title: result.title ?? result.url ?? "EXA result",
          url: result.url ?? "",
          snippet: result.highlights?.join(" ") || result.text || "",
          sourceProvider: "exa" as const,
          confidence: clampConfidence(result.score ?? 0.82),
          raw: result
        }));
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown EXA error";
      return [];
    }
  }

  return {
    name: "exa",
    mode,
    isConfigured,
    async invoke(input) {
      return this.searchCompanyContacts(input);
    },
    async searchCompanyWebsite(input) {
      return runSearch(
        `${input.companyName} official website ${input.country ?? ""} ${input.sourceKeyword ?? ""}`,
        undefined
      );
    },
    async searchCompanyContacts(input) {
      const results = await runSearch(
        `${input.companyName} contact email phone ${input.country ?? ""}`,
        input.website
      );
      return extractContactResults(results);
    },
    async searchWhatsapp(input) {
      const results = await runSearch(
        `${input.companyName} WhatsApp phone contact ${input.country ?? ""}`,
        input.website
      );
      return extractContactResults(results).filter(
        (result) => result.type === "whatsapp" || result.type === "phone"
      );
    },
    async searchLinkedinFacebook(input) {
      const results = await runSearch(`${input.companyName} LinkedIn Facebook ${input.country ?? ""}`);
      return extractContactResults(results).filter(
        (result) => result.type === "linkedin" || result.type === "facebook"
      );
    },
    status() {
      return {
        provider: "exa",
        configured: isConfigured,
        mode,
        lastError
      };
    }
  };
}

export function mockSearchResults(
  provider: Exclude<SearchProviderName, "mock">,
  query: string,
  fallbackUrl?: string,
  fallbackReason?: string
): SearchResult[] {
  void provider;
  void query;
  void fallbackUrl;
  void fallbackReason;

  return [];
}

export function extractContactResults(results: SearchResult[]): ContactSearchResult[] {
  return results.flatMap((result) => {
    const text = `${result.title} ${result.url} ${result.snippet}`;
    const contacts: ContactSearchResult[] = [];
    const emailMatches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    const phoneMatches = text.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{4,}/g) ?? [];

    for (const email of new Set(emailMatches)) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) continue;
      contacts.push(toContact("email", normalizedEmail, result));
    }
    for (const phone of new Set(phoneMatches)) {
      const normalized = phone.replace(/\s+/g, " ").trim();
      const digits = normalized.replace(/[^\d]/g, "");
      if (/(\d)\1{6,}/.test(digits) || /^(1234567|0123456)/.test(digits)) continue;
      contacts.push(toContact("phone", normalized, result));
      if (/whatsapp|wa\.me/i.test(text)) {
        contacts.push(toContact("whatsapp", normalized.replace(/[^\d+]/g, ""), result));
      }
    }
    if (/linkedin\.com/i.test(result.url)) contacts.push(toContact("linkedin", result.url, result));
    if (/facebook\.com/i.test(result.url)) contacts.push(toContact("facebook", result.url, result));
    if (/wa\.me|whatsapp/i.test(result.url)) contacts.push(toContact("whatsapp", result.url, result));

    return contacts;
  });
}

function toContact(
  type: ContactSearchResult["type"],
  value: string,
  result: SearchResult
): ContactSearchResult {
  return {
    type,
    value,
    sourceUrl: result.url,
    sourceProvider: result.sourceProvider,
    confidence: Math.max(0.55, result.confidence - 0.05),
    evidenceText: result.snippet || result.title,
    raw: result.raw
  };
}

function clampConfidence(value: number) {
  if (value > 1) return Math.min(0.98, value / 10);
  return Math.max(0.5, Math.min(0.98, value));
}

export function resolveProviderEndpoint(
  configuredBaseUrl: string | undefined,
  fallbackBaseUrl: string,
  endpoint: string
) {
  const url = new URL((configuredBaseUrl?.trim() || fallbackBaseUrl).replace(/\/$/, ""));
  const normalizedEndpoint = endpoint.replace(/^\//, "");

  if (!url.pathname.replace(/\/$/, "").endsWith(`/${normalizedEndpoint}`)) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${normalizedEndpoint}`;
  }

  return url.toString();
}

export const exaProvider = createExaProvider();
