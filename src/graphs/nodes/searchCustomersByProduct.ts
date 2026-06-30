import { completeNode, type LeadCandidate, type LeadGenerationGraphState } from "@/graphs/state";
import { contentModelProvider } from "@/providers/contentModelProvider";
import type { MinimaxSearchToolOutput } from "@/providers/minimaxProvider";
import { updateRun, updateRunStep } from "@/repositories/store";
import { extractDomain } from "@/services/domainNormalizeService";
import {
  buildProductSearchQueries,
  countryNameForSearch
} from "@/services/searchQueryBuilder";
import { extractCandidateCompaniesFromSearchResult } from "@/services/searchResultExtractor";
import { searchProviderRouter, type RoutedSearchResult } from "@/services/searchProviderRouter";
import type { SearchResult } from "@/types";

export async function searchCustomersByProduct(state: LeadGenerationGraphState) {
  const keywords = state.approvedKeywords.length > 0 ? state.approvedKeywords : state.keywords;
  const productName = state.normalizedProduct ?? state.productInput;
  const targetCountries = state.targetCountries ?? [];
  const excludedCountries = state.excludedCountries ?? [];
  const targetCountrySearchText = targetCountries.map(countryNameForSearch).filter(Boolean).join(", ");
  const queryPlan = buildProductSearchQueries({
    productName,
    approvedKeywords: keywords,
    targetCount: state.targetCount,
    targetCountries
  });
  const candidates: LeadCandidate[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];
  let searchedQueryCount = 0;
  const contentModelToolUseQueryLimit = Math.max(
    0,
    Math.min(
      Number.parseInt(
        process.env.PRODUCT_SEARCH_CONTENT_MODEL_TOOL_QUERIES ??
          process.env.PRODUCT_SEARCH_MINIMAX_TOOL_QUERIES ??
          "1",
        10
      ) || 0,
      3
    )
  );

  for (const query of queryPlan) {
    searchedQueryCount += 1;
    await updateSearchProgress(state, {
      query,
      searchedQueryCount,
      totalQueryCount: queryPlan.length,
      candidatesFound: candidates.length
    });

    if (searchedQueryCount <= contentModelToolUseQueryLimit) {
      const toolSearch = await contentModelProvider.searchWithTools({
        objective:
          "Find real B2B importer, distributor, dealer, trading company, repair/service company, or industrial buyer company candidates for this product. Prefer official company websites and contact/about pages. Avoid marketplaces, directories, and generic product article pages.",
        context: {
          productName,
          country: targetCountrySearchText,
          sourceKeyword: query
        },
        defaultSearchType: "website",
        mode: state.searchMode,
        providerPriority: state.providerPriority,
        maxToolCalls: 1,
        minResults: 1,
        minConfidence: 0.5
      });
      errors.push(...toolErrorsFrom(toolSearch));
      addCandidates(
        candidatesFromToolSearch(toolSearch, {
          productName,
          excludedCountries,
          targetCount: state.targetCount
        }),
        candidates,
        seen,
        state.targetCount
      );

      if (candidates.length >= state.targetCount) break;
    }

    const routed = await searchProviderRouter.search({
      query,
      searchType: "website",
      mode: state.searchMode,
      providerPriority: state.providerPriority,
      websiteInput: {
        companyName: productName,
        country: targetCountrySearchText,
        sourceKeyword: query
      },
      minResults: 1,
      minConfidence: 0.5
    });
    errors.push(...routed.errors, ...routed.attempts.flatMap((attempt) => attempt.errorMessage ?? []));
    addCandidates(
      candidatesFromRoutedSearch(routed, {
        productName,
        matchedKeyword: query,
        excludedCountries
      }),
      candidates,
      seen,
      state.targetCount
    );

    if (candidates.length >= state.targetCount) break;
  }

  const finalCandidates = candidates.slice(0, state.targetCount);
  const summary =
    finalCandidates.length > 0
      ? `Found ${finalCandidates.length} product-search candidates from ${searchedQueryCount} expanded queries.`
      : "No product-search candidates were found from public search results.";

  return {
    candidates: finalCandidates,
    errors: [...state.errors, ...dedupeStrings(errors)],
    ...completeNode(state, "searchCustomersByProduct", summary)
  };
}

async function updateSearchProgress(
  state: LeadGenerationGraphState,
  input: {
    query: string;
    searchedQueryCount: number;
    totalQueryCount: number;
    candidatesFound: number;
  }
) {
  const summary = `Searching query ${input.searchedQueryCount}/${input.totalQueryCount}: ${input.query}. Candidates so far: ${input.candidatesFound}.`;
  await updateRunStep(state.runId, "searchCustomersByProduct", {
    status: "running",
    summary
  });
  await updateRun(state.runId, {
    status: "running",
    currentStep: "searchCustomersByProduct",
    metadata: {
      queueStatus: "running",
      currentQueueStep: "searchCustomersByProduct",
      productSearchProgress: {
        currentQuery: input.query,
        searchedQueryCount: input.searchedQueryCount,
        totalQueryCount: input.totalQueryCount,
        candidatesFound: input.candidatesFound
      }
    }
  });
}

function addCandidates(
  incoming: LeadCandidate[],
  candidates: LeadCandidate[],
  seen: Set<string>,
  targetCount: number
) {
  for (const candidate of incoming) {
    const key = candidateKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= targetCount) break;
  }
}

function candidatesFromRoutedSearch(
  routed: RoutedSearchResult,
  input: {
    productName: string;
    matchedKeyword: string;
    excludedCountries: string[];
  }
) {
  return routed.websiteResults
    .flatMap((result) =>
      candidateFromSearchResult(result, {
        productName: input.productName,
        matchedKeyword: input.matchedKeyword,
        excludedCountries: input.excludedCountries,
        provider: routed.provider ?? result.sourceProvider
      })
    )
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

function candidatesFromToolSearch(
  toolSearch: MinimaxSearchToolOutput,
  input: {
    productName: string;
    excludedCountries: string[];
    targetCount: number;
  }
): LeadCandidate[] {
  const candidates: LeadCandidate[] = [];
  const seen = new Set<string>();

  for (const call of toolSearch.toolCalls) {
    for (const result of call.result.websiteResults) {
      const converted = candidateFromSearchResult(result, {
        productName: input.productName,
        matchedKeyword: call.query,
        excludedCountries: input.excludedCountries,
        provider: call.result.provider ?? result.sourceProvider
      });

      for (const candidate of converted) {
        const key = candidateKey(candidate);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        candidates.push(candidate);
        if (candidates.length >= input.targetCount) return candidates;
      }
    }
  }

  return candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

function candidateFromSearchResult(
  result: SearchResult,
  input: {
    productName: string;
    matchedKeyword: string;
    excludedCountries?: string[];
    provider: string;
  }
) {
  return extractCandidateCompaniesFromSearchResult({
    result,
    productName: input.productName,
    sourceQuery: input.matchedKeyword,
    sourceProvider: input.provider,
    excludedCountries: input.excludedCountries
  });
}

function toolErrorsFrom(toolSearch: MinimaxSearchToolOutput) {
  return [
    ...(toolSearch.fallbackReason ? [toolSearch.fallbackReason] : []),
    ...toolSearch.toolCalls.flatMap((call) => [
      ...call.result.errors,
      ...call.result.attempts.flatMap((attempt) => attempt.errorMessage ?? [])
    ])
  ];
}

function candidateKey(candidate: LeadCandidate) {
  return candidate.website
    ? extractDomain(candidate.website) || candidate.companyName.toLowerCase()
    : candidate.companyName.toLowerCase();
}

function dedupeStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}
