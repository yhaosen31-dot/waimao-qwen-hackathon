import {
  extractContactResults,
  resolveProviderEndpoint,
  type CompanyContactSearchInput,
  type CompanyWebsiteSearchInput,
  type SearchProviderMethods
} from "@/providers/exaProvider";
import { fetchWithTimeout } from "@/providers/providerFetch";
import { envFlag, type ExternalProvider, type ProviderFactoryOptions } from "@/providers/types";
import type { ContactSearchResult, SearchResult } from "@/types";

export type YouProvider = ExternalProvider<CompanyContactSearchInput, ContactSearchResult[]> &
  SearchProviderMethods;

export function createYouProvider(options: ProviderFactoryOptions = {}): YouProvider {
  const isConfigured = envFlag(process.env.YOU_API_KEY);
  const mode = options.mode ?? (isConfigured ? "real" : "mock");
  let lastError: string | undefined;

  async function runSearch(query: string, fallbackUrl?: string): Promise<SearchResult[]> {
    void fallbackUrl;

    if (mode !== "real" || !isConfigured) {
      lastError = "YOU is not configured.";
      return [];
    }

    try {
      const endpoint = process.env.YOU_BASE_URL?.includes("ydc-index.io") ? "v1/search" : "search";
      const url = new URL(
        resolveProviderEndpoint(process.env.YOU_BASE_URL, "https://api.you.com/v1", endpoint)
      );
      url.searchParams.set("query", query);
      url.searchParams.set("count", "5");

      const response = await fetchWithTimeout(url, {
        headers: {
          "X-API-Key": process.env.YOU_API_KEY ?? ""
        }
      });

      if (!response.ok) {
        throw new Error(`YOU search failed with ${response.status}`);
      }

      const raw = (await response.json()) as {
        results?: unknown[];
      };

      lastError = undefined;
      return flattenYouResults(raw.results ?? []).map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        sourceProvider: "you" as const,
        confidence: 0.78,
        raw: result.raw
      }));
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown YOU error";
      return [];
    }
  }

  return {
    name: "you",
    mode,
    isConfigured,
    async invoke(input) {
      return this.searchCompanyContacts(input);
    },
    async searchCompanyWebsite(input: CompanyWebsiteSearchInput) {
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
        provider: "you",
        configured: isConfigured,
        mode,
        lastError
      };
    }
  };
}

interface FlattenedYouResult {
  title: string;
  url: string;
  snippet: string;
  raw: unknown;
}

function flattenYouResults(items: unknown[]): FlattenedYouResult[] {
  return items.flatMap((item) => {
    const record = item as {
      title?: string;
      url?: string;
      snippet?: string;
      description?: string;
      snippets?: string[];
      results?: unknown[];
    };

    if (record.results) return flattenYouResults(record.results);
    if (!record.url) return [];

    return [
      {
        title: record.title ?? record.url,
        url: record.url,
        snippet: record.snippet ?? record.description ?? record.snippets?.join(" ") ?? "",
        raw: item
      }
    ];
  });
}

export const youProvider = createYouProvider();
