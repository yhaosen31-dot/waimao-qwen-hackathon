import {
  extractContactResults,
  mockSearchResults,
  type CompanyContactSearchInput,
  type CompanyWebsiteSearchInput,
  type SearchProviderMethods
} from "@/providers/exaProvider";
import { envFlag, type ExternalProvider, type ProviderFactoryOptions } from "@/providers/types";
import type { ContactSearchResult, SearchResult } from "@/types";

export type TavilyProvider = ExternalProvider<CompanyContactSearchInput, ContactSearchResult[]> &
  SearchProviderMethods;

export function createTavilyProvider(options: ProviderFactoryOptions = {}): TavilyProvider {
  const isConfigured = envFlag(process.env.TAVILY_API_KEY);
  const mode = options.mode ?? (isConfigured ? "real" : "mock");
  let lastError: string | undefined;

  async function runSearch(query: string, fallbackUrl?: string): Promise<SearchResult[]> {
    if (mode !== "real" || !isConfigured) {
      return mockSearchResults("tavily", query, fallbackUrl);
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.TAVILY_API_KEY ?? ""}`
        },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          max_results: 5,
          include_answer: false,
          include_raw_content: false
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed with ${response.status}`);
      }

      const raw = (await response.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          score?: number;
        }>;
      };

      lastError = undefined;
      return (raw.results ?? [])
        .filter((result) => result.url)
        .map((result) => ({
          title: result.title ?? result.url ?? "Tavily result",
          url: result.url ?? "",
          snippet: result.content ?? "",
          sourceProvider: "tavily" as const,
          confidence: Math.max(0.5, Math.min(0.98, result.score ?? 0.8)),
          raw: result
        }));
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown Tavily error";
      return mockSearchResults("tavily", query, fallbackUrl, lastError);
    }
  }

  return {
    name: "tavily",
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
        provider: "tavily",
        configured: isConfigured,
        mode,
        lastError
      };
    }
  };
}

export const tavilyProvider = createTavilyProvider();
