import { fetchWithTimeout } from "@/providers/providerFetch";
import { envFlag, type ProviderFactoryOptions } from "@/providers/types";
import { searchProviderRouter } from "@/services/searchProviderRouter";
import {
  minimaxProvider,
  type BuyerFitScoreInput,
  type BuyerFitScoreOutput,
  type ColdEmailInput,
  type ColdEmailOutput,
  type MinimaxDraftInput,
  type MinimaxDraftOutput,
  type MinimaxProvider,
  type MinimaxSearchToolCallResult,
  type MinimaxSearchToolInput,
  type MinimaxSearchToolOutput,
  type ProductKeywordInput,
  type ProductKeywordOutput,
  type ProductNameNormalizeInput,
  type ProductNameNormalizeOutput
} from "@/providers/minimaxProvider";
import type { SearchQueryType } from "@/types";

type QwenChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type QwenProvider = MinimaxProvider;

export function createQwenProvider(options: ProviderFactoryOptions = {}): QwenProvider {
  const apiKey = qwenApiKey();
  const isConfigured = envFlag(apiKey);
  const realModeRequested = process.env.QWEN_REAL_MODE === "true";
  const mode = options.mode ?? (isConfigured && realModeRequested ? "real" : "mock");

  async function withFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    label: string
  ) {
    if (mode !== "real" || !isConfigured) return fallback();

    try {
      return await operation();
    } catch (error) {
      const result = await fallback();
      const reason = error instanceof Error ? error.message : "Unknown Qwen error";

      if (result && typeof result === "object" && "fallbackReason" in result) {
        return {
          ...result,
          fallbackReason: `Qwen ${label} failed: ${reason}`
        };
      }

      return result;
    }
  }

  return {
    name: "qwen",
    mode,
    isConfigured,

    async invoke(input: MinimaxDraftInput): Promise<MinimaxDraftOutput> {
      return {
        ...(await minimaxProvider.invoke(input)),
        provider: mode === "real" && isConfigured ? "qwen" : "mock-minimax"
      };
    },

    async normalizeProductName(input: ProductNameNormalizeInput): Promise<ProductNameNormalizeOutput> {
      return withFallback(
        async () => ({
          ...(await callQwenJson<ProductNameNormalizeOutput>({
            system: [
              "You normalize product names for B2B export lead search.",
              "Return only JSON: { originalProduct, normalizedProduct, detectedLanguage, translated }.",
              "If the input is Chinese, translate it into a concise English product phrase.",
              "Do not add buyer words such as importer, supplier, distributor, or contact."
            ].join("\n"),
            user: input
          })),
          provider: "qwen" as const
        }),
        () => minimaxProvider.normalizeProductName(input),
        "product normalization"
      );
    },

    async generateProductKeywords(input: ProductKeywordInput): Promise<ProductKeywordOutput[]> {
      return withFallback(
        async () => {
          const parsed = await callQwenJson<{ keywords?: Partial<ProductKeywordOutput>[] }>({
            system: [
              "You generate concise English B2B search keywords for export lead generation.",
              "Return only JSON: { keywords: [{ keyword, score, reason, riskLevel }] }.",
              "Keywords must help find importers, distributors, dealers, repair/service companies, or industrial buyers.",
              "Generate 6-10 keywords. Do not invent company names."
            ].join("\n"),
            user: input
          });

          return normalizeKeywords(parsed.keywords, input.productInput);
        },
        () => minimaxProvider.generateProductKeywords(input),
        "keyword generation"
      );
    },

    async scoreBuyerFit(input: BuyerFitScoreInput): Promise<BuyerFitScoreOutput> {
      return withFallback(
        async () => ({
          ...normalizeBuyerFitOutput(
            await callQwenJson<Partial<BuyerFitScoreOutput>>({
              system: [
                "You score B2B buyer fit for export lead generation.",
                "Return only JSON matching: { buyerFit, companyRole, leadScore, confidence, reasons, risks, suggestedAction }.",
                "Use only the supplied evidence. Do not invent websites, emails, phones, WhatsApp, LinkedIn, or Facebook.",
                "Prefer conservative scoring when evidence is weak."
              ].join("\n"),
              user: input
            })
          ),
          provider: "qwen" as const
        }),
        () => minimaxProvider.scoreBuyerFit(input),
        "Buyer Fit scoring"
      );
    },

    async generateColdEmail(input: ColdEmailInput): Promise<ColdEmailOutput> {
      return withFallback(
        async () => ({
          ...normalizeColdEmailOutput(
            await callQwenJson<Partial<ColdEmailOutput>>({
              system: [
                "You write first-touch B2B cold emails in English.",
                "Return only JSON: { subject, body, usedEvidenceIds, styleNotes }.",
                "Use only the supplied evidence. Do not invent customer facts or contact details.",
                "Write 5-7 short sentences. Avoid generic AI phrases."
              ].join("\n"),
              user: input
            }),
            input.evidenceIds ?? []
          ),
          provider: "qwen" as const
        }),
        () => minimaxProvider.generateColdEmail(input),
        "email generation"
      );
    },

    async searchWithTools(input: MinimaxSearchToolInput): Promise<MinimaxSearchToolOutput> {
      return withFallback(
        () => runQwenToolSearch(input),
        () => minimaxProvider.searchWithTools(input),
        "tool-use search"
      );
    }
  };
}

async function callQwenJson<T>(input: { system: string; user: unknown }): Promise<T> {
  const response = await fetchWithTimeout(
    resolveQwenChatEndpoint(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${qwenApiKey()}`
      },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || "qwen-plus",
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: JSON.stringify(input.user, null, 2) }
        ] satisfies QwenChatMessage[],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    },
    30_000
  );

  if (!response.ok) {
    throw new Error(`Qwen API returned ${response.status}`);
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = raw.choices?.[0]?.message?.content ?? "";
  return JSON.parse(extractJson(content)) as T;
}

function qwenApiKey() {
  return process.env.QWEN_API_KEY?.trim() || process.env.DASHSCOPE_API_KEY?.trim() || "";
}

function resolveQwenChatEndpoint() {
  const baseUrl =
    process.env.QWEN_BASE_URL?.trim() ||
    process.env.DASHSCOPE_BASE_URL?.trim() ||
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const url = new URL(baseUrl.replace(/\/$/, ""));
  const normalizedPath = url.pathname.replace(/\/$/, "");

  if (!/\/chat\/completions$/i.test(normalizedPath)) {
    url.pathname = `${normalizedPath}/chat/completions`;
  }

  return url.toString();
}

function normalizeKeywords(value: Partial<ProductKeywordOutput>[] | undefined, fallbackProduct: string) {
  if (!Array.isArray(value) || value.length === 0) {
    return minimaxProvider.generateProductKeywords({ productInput: fallbackProduct, targetCount: 20 });
  }

  const keywords = value
    .map((item) => ({
      keyword: normalizeText(item.keyword),
      score: clampNumber(item.score, 0, 1, 0.78),
      reason: String(item.reason ?? "Qwen keyword for B2B product search."),
      riskLevel: isRiskLevel(item.riskLevel) ? item.riskLevel : ("medium" as const)
    }))
    .filter((item) => item.keyword.length >= 3);

  const seen = new Set<string>();
  const unique = keywords.filter((item) => {
    if (seen.has(item.keyword)) return false;
    seen.add(item.keyword);
    return true;
  });

  return unique.length > 0 ? unique.slice(0, 10) : minimaxProvider.generateProductKeywords({ productInput: fallbackProduct, targetCount: 20 });
}

type QwenSearchToolPlan = {
  queries?: Array<{
    query?: unknown;
    searchType?: unknown;
  }>;
  finalText?: unknown;
};

async function runQwenToolSearch(input: MinimaxSearchToolInput): Promise<MinimaxSearchToolOutput> {
  const plan = await callQwenJson<QwenSearchToolPlan>({
    system: [
      "You are an autopilot B2B export lead agent.",
      "Plan calls to the available tool search_web, but return JSON only.",
      "Return JSON: { queries: [{ query, searchType }], finalText }.",
      "searchType must be one of website, contact, email, phone, whatsapp, social.",
      "Use precise public-web queries. Do not invent companies, websites, emails, phones, WhatsApp, LinkedIn, or Facebook."
    ].join("\n"),
    user: {
      objective: input.objective,
      context: input.context,
      defaultSearchType: input.defaultSearchType ?? "website",
      maxToolCalls: input.maxToolCalls ?? 2,
      instructions: [
        "Plan only the minimum useful searches.",
        "Prefer official company websites and contact/about pages.",
        "Avoid broad marketplaces, generic product articles, and unrelated directory pages."
      ]
    }
  });
  const requests = normalizeQwenSearchRequests(plan.queries, input);
  const toolCalls: MinimaxSearchToolCallResult[] = [];

  for (const request of requests) {
    const result = await searchProviderRouter.search({
      query: request.query,
      searchType: request.searchType,
      mode: input.mode,
      providerPriority: input.providerPriority,
      companyId: input.companyId,
      importJobId: input.importJobId,
      websiteInput:
        request.searchType === "website"
          ? {
              companyName: companyNameForToolSearch(input),
              country: input.context.country,
              sourceKeyword: input.context.sourceKeyword ?? request.query
            }
          : undefined,
      contactInput:
        request.searchType !== "website"
          ? {
              companyName: companyNameForToolSearch(input),
              country: input.context.country,
              website: input.context.website
            }
          : undefined,
      minResults: input.minResults,
      minConfidence: input.minConfidence
    });

    toolCalls.push({
      id: `qwen_search_web_${toolCalls.length + 1}`,
      name: "search_web",
      query: request.query,
      searchType: request.searchType,
      result
    });
  }

  return {
    provider: "qwen",
    finalText:
      String(plan.finalText ?? "").trim() ||
      `Qwen planned and executed ${toolCalls.length} search_web call(s).`,
    toolCalls
  };
}

function normalizeQwenSearchRequests(
  value: QwenSearchToolPlan["queries"],
  input: MinimaxSearchToolInput
): Array<{ query: string; searchType: SearchQueryType }> {
  const maxToolCalls = Math.max(1, Math.min(input.maxToolCalls ?? 2, 4));
  const planned = Array.isArray(value) ? value : [];
  const requests = planned
    .map((item) => ({
      query: sanitizeSearchQuery(item.query),
      searchType: normalizeSearchType(item.searchType, input.defaultSearchType)
    }))
    .filter((item) => item.query.length > 0);
  const fallback =
    requests.length > 0
      ? requests
      : [
          {
            query: defaultQwenSearchQuery(input),
            searchType: input.defaultSearchType ?? ("website" as const)
          }
        ];
  const seen = new Set<string>();

  return fallback
    .filter((item) => {
      const key = `${item.searchType}:${item.query.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxToolCalls);
}

function companyNameForToolSearch(input: MinimaxSearchToolInput) {
  return (
    input.context.companyName?.trim() ||
    input.context.productName?.trim() ||
    input.context.sourceKeyword?.trim() ||
    input.objective
  ).slice(0, 180);
}

function defaultQwenSearchQuery(input: MinimaxSearchToolInput) {
  const parts = [
    input.context.companyName,
    input.context.productName,
    input.context.sourceKeyword,
    input.context.country,
    input.defaultSearchType === "website" ? "official website" : "contact email phone"
  ]
    .map((item) => item?.trim())
    .filter(Boolean);

  return (parts.join(" ") || input.objective).slice(0, 240);
}

function normalizeSearchType(value: unknown, fallback: SearchQueryType = "website"): SearchQueryType {
  const normalized = String(value ?? "").toLowerCase();
  if (["website", "contact", "email", "phone", "whatsapp", "social"].includes(normalized)) {
    return normalized as SearchQueryType;
  }
  return fallback;
}

function sanitizeSearchQuery(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function normalizeBuyerFitOutput(value: Partial<BuyerFitScoreOutput>): BuyerFitScoreOutput {
  const leadScore = clampNumber(value.leadScore, 0, 100, 50);
  const confidence = clampNumber(value.confidence, 0, 1, 0.55);

  return {
    buyerFit: isBuyerFit(value.buyerFit) ? value.buyerFit : leadScore >= 78 ? "high" : leadScore >= 55 ? "medium" : "unknown",
    companyRole: isCompanyRole(value.companyRole) ? value.companyRole : "unknown",
    leadScore,
    confidence,
    reasons: normalizeStringArray(value.reasons, ["Qwen returned limited scoring reasons."]),
    risks: normalizeStringArray(value.risks, ["Qwen returned limited risk notes."]),
    suggestedAction: isSuggestedAction(value.suggestedAction) ? value.suggestedAction : "manual_review"
  };
}

function normalizeColdEmailOutput(value: Partial<ColdEmailOutput>, fallbackEvidenceIds: string[]): ColdEmailOutput {
  return {
    subject: normalizeSubject(value.subject),
    body: normalizeBody(value.body),
    usedEvidenceIds:
      Array.isArray(value.usedEvidenceIds) && value.usedEvidenceIds.length > 0
        ? value.usedEvidenceIds.map(String)
        : fallbackEvidenceIds.slice(0, 8),
    styleNotes: normalizeStringArray(value.styleNotes, ["Qwen generated a short evidence-based email."])
  };
}

function extractJson(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Qwen response did not contain JSON.");
  return match[0];
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeSubject(value: unknown) {
  return String(value ?? "Quick question").replace(/\s+/g, " ").trim().slice(0, 90) || "Quick question";
}

function normalizeBody(value: unknown) {
  return String(value ?? "").trim() || "Hi,\nI found a saved buyer signal for your company.\nCould you tell me who reviews suppliers for this item?";
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 8) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}

function isRiskLevel(value: unknown): value is ProductKeywordOutput["riskLevel"] {
  return value === "low" || value === "medium" || value === "high";
}

function isBuyerFit(value: unknown): value is BuyerFitScoreOutput["buyerFit"] {
  return value === "high" || value === "medium" || value === "low" || value === "unknown";
}

function isCompanyRole(value: unknown): value is BuyerFitScoreOutput["companyRole"] {
  return value === "importer" || value === "distributor" || value === "trading_company" || value === "manufacturer" || value === "end_user" || value === "unknown";
}

function isSuggestedAction(value: unknown): value is BuyerFitScoreOutput["suggestedAction"] {
  return value === "email_first" || value === "whatsapp_first" || value === "manual_review" || value === "skip";
}

export const qwenProvider = createQwenProvider();
