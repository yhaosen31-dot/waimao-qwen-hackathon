import {
  exaProvider,
  type CompanyContactSearchInput,
  type CompanyWebsiteSearchInput,
  type SearchProviderMethods
} from "@/providers/exaProvider";
import { tavilyProvider } from "@/providers/tavilyProvider";
import { youProvider } from "@/providers/youProvider";
import { recordSearchQueryLog, updateSearchProviderUsage } from "@/repositories/store";
import { consumeRateLimit } from "@/services/rateLimitService";
import type {
  ContactSearchResult,
  EntityId,
  SearchMode,
  SearchProviderName,
  SearchQueryType,
  SearchResult
} from "@/types";

type RealSearchProviderName = Exclude<SearchProviderName, "mock">;

const providers: SearchProviderMethods[] = [exaProvider, tavilyProvider, youProvider];

export interface SearchProviderStatus {
  configured: boolean;
  ok: boolean;
  mode: "mock" | "real";
  lastError?: string;
}

export interface SearchProviderAttempt {
  provider: SearchProviderName;
  configured: boolean;
  mode: "mock" | "real";
  status: "success" | "failed" | "fallback" | "skipped";
  resultCount: number;
  averageConfidence?: number;
  errorMessage?: string;
  fallbackReason?: string;
}

export interface RoutedSearchInput {
  query: string;
  searchType: SearchQueryType;
  mode?: SearchMode;
  providerPriority?: RealSearchProviderName[];
  companyId?: EntityId;
  importJobId?: EntityId;
  websiteInput?: CompanyWebsiteSearchInput;
  contactInput?: CompanyContactSearchInput;
  minResults?: number;
  minConfidence?: number;
}

export interface RoutedSearchResult {
  query: string;
  searchType: SearchQueryType;
  mode: SearchMode;
  provider?: SearchProviderName;
  websiteResults: SearchResult[];
  contactResults: ContactSearchResult[];
  attempts: SearchProviderAttempt[];
  errors: string[];
}

export const searchProviderRouter = {
  async search(input: RoutedSearchInput): Promise<RoutedSearchResult> {
    const mode = input.mode ?? "economy";
    const minResults = input.minResults ?? 1;
    const minConfidence = input.minConfidence ?? 0.58;
    const attempts: SearchProviderAttempt[] = [];
    const errors: string[] = [];
    let selectedWebsiteResults: SearchResult[] = [];
    let selectedContactResults: ContactSearchResult[] = [];
    let selectedProvider: SearchProviderName | undefined;
    let providersTried = 0;

    for (const provider of orderProviders(input.providerPriority)) {
      const status = provider.status();
      if (!shouldTryProvider(mode, providersTried, attempts)) {
        attempts.push({
          provider: status.provider,
          configured: status.configured,
          mode: status.mode,
          status: "skipped",
          resultCount: 0,
          fallbackReason: "Search mode did not require another provider."
        });
        continue;
      }

      providersTried += 1;
      try {
        const providerName = status.provider;
        const rateLimit = await consumeRateLimit({
          policy: "search_provider",
          subject: providerName
        });
        if (!rateLimit.allowed) {
          throw new Error(
            `Search provider rate limit reached for ${providerName}. Retry after ${rateLimit.retryAfterSeconds}s.`
          );
        }

        const output = await runProviderSearch(provider, input);
        const resultCount = output.websiteResults.length + output.contactResults.length;
        const averageConfidence = averageConfidenceFor(output);
        const qualityIssue =
          resultCount < minResults || (resultCount > 0 && averageConfidence < minConfidence);
        const attemptStatus = qualityIssue && shouldAllowFallback(mode, providersTried)
          ? "fallback"
          : "success";
        const fallbackReason = qualityIssue
          ? `Result quality below threshold: count=${resultCount}, confidence=${averageConfidence.toFixed(2)}.`
          : undefined;

        attempts.push({
          provider: status.provider,
          configured: status.configured,
          mode: status.mode,
          status: attemptStatus,
          resultCount,
          averageConfidence,
          fallbackReason
        });
        await recordProviderAttempt(input, mode, {
          provider: status.provider,
          status: attemptStatus,
          resultCount,
          averageConfidence,
          fallbackReason
        });

        if (!qualityIssue || !shouldAllowFallback(mode, providersTried)) {
          selectedWebsiteResults = output.websiteResults;
          selectedContactResults = output.contactResults;
          selectedProvider = status.provider;
          break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown provider error";
        errors.push(`${status.provider}: ${errorMessage}`);
        attempts.push({
          provider: status.provider,
          configured: status.configured,
          mode: status.mode,
          status: "failed",
          resultCount: 0,
          errorMessage
        });
        await recordProviderAttempt(input, mode, {
          provider: status.provider,
          status: "failed",
          resultCount: 0,
          averageConfidence: 0,
          errorMessage
        });

        if (!shouldAllowFallback(mode, providersTried)) break;
      }
    }

    return {
      query: input.query,
      searchType: input.searchType,
      mode,
      provider: selectedProvider,
      websiteResults: selectedWebsiteResults,
      contactResults: selectedContactResults,
      attempts,
      errors
    };
  },

  statuses(): Record<RealSearchProviderName, SearchProviderStatus> {
    return Object.fromEntries(
      providers.map((provider) => {
        const status = provider.status();

        return [
          status.provider,
          {
            configured: status.configured,
            ok: !status.lastError,
            mode: status.mode,
            lastError: status.lastError
          }
        ] as const;
      })
    ) as Record<RealSearchProviderName, SearchProviderStatus>;
  }
};

function orderProviders(priority: RealSearchProviderName[] = []) {
  const providerByName = new Map<RealSearchProviderName, SearchProviderMethods>(
    providers.map((provider) => [provider.status().provider as RealSearchProviderName, provider])
  );
  const ordered = priority
    .map((name) => providerByName.get(name))
    .filter(isSearchProviderMethods);
  const remaining = providers.filter(
    (provider) => !priority.includes(provider.status().provider as RealSearchProviderName)
  );

  return [...ordered, ...remaining];
}

function isSearchProviderMethods(
  provider: SearchProviderMethods | undefined
): provider is SearchProviderMethods {
  return Boolean(provider);
}

async function runProviderSearch(provider: SearchProviderMethods, input: RoutedSearchInput) {
  if (input.searchType === "website") {
    return {
      websiteResults: await provider.searchCompanyWebsite(
        input.websiteInput ?? {
          companyName: input.query
        }
      ),
      contactResults: []
    };
  }

  if (input.searchType === "whatsapp") {
    return {
      websiteResults: [],
      contactResults: await provider.searchWhatsapp(
        input.contactInput ?? {
          companyName: input.query
        }
      )
    };
  }

  if (input.searchType === "social") {
    const contactInput = input.contactInput ?? {
      companyName: input.query
    };

    return {
      websiteResults: [],
      contactResults: await provider.searchLinkedinFacebook({
        companyName: contactInput.companyName,
        country: contactInput.country
      })
    };
  }

  return {
    websiteResults: [],
    contactResults: await provider.searchCompanyContacts(
      input.contactInput ?? {
        companyName: input.query
      }
    )
  };
}

async function recordProviderAttempt(
  input: RoutedSearchInput,
  mode: SearchMode,
  attempt: {
    provider: SearchProviderName;
    status: "success" | "failed" | "fallback";
    resultCount: number;
    averageConfidence?: number;
    fallbackReason?: string;
    errorMessage?: string;
  }
) {
  await recordSearchQueryLog({
    companyId: input.companyId,
    importJobId: input.importJobId,
    query: input.query,
    searchType: input.searchType,
    mode,
    provider: attempt.provider,
    status: attempt.status,
    resultCount: attempt.resultCount,
    averageConfidence: attempt.averageConfidence,
    fallbackReason: attempt.fallbackReason,
    errorMessage: attempt.errorMessage
  });
  await updateSearchProviderUsage({
    provider: attempt.provider,
    success: attempt.status !== "failed",
    fallbackUsed: attempt.status === "fallback",
    errorMessage: attempt.errorMessage
  });
}

function shouldTryProvider(
  mode: SearchMode,
  providersTried: number,
  attempts: SearchProviderAttempt[]
) {
  if (providersTried === 0) return true;
  if (mode === "economy") return false;
  if (mode === "deep_verify") return providersTried < 2;
  return attempts.some((attempt) => attempt.status === "failed" || attempt.status === "fallback");
}

function shouldAllowFallback(mode: SearchMode, providersTried: number) {
  if (mode === "economy") return false;
  if (mode === "deep_verify") return providersTried < 2;
  return providersTried < providers.length;
}

function averageConfidenceFor(output: {
  websiteResults: SearchResult[];
  contactResults: ContactSearchResult[];
}) {
  const confidences = [...output.websiteResults, ...output.contactResults].map(
    (result) => result.confidence
  );

  if (confidences.length === 0) return 0;
  return confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
}
