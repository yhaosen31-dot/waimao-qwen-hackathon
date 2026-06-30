import { envFlag, type ExternalProvider, type ProviderFactoryOptions } from "@/providers/types";
import { fetchWithTimeout } from "@/providers/providerFetch";
import { emailDomainMatchesWebsite } from "@/services/contactNormalizeService";
import { domainMatchesCompany, extractDomain } from "@/services/domainNormalizeService";
import { consumeRateLimit } from "@/services/rateLimitService";
import { searchProviderRouter, type RoutedSearchResult } from "@/services/searchProviderRouter";
import type {
  BuyerFitTier,
  CompanyRole,
  EntityId,
  SearchMode,
  SearchProviderName,
  SearchQueryType,
  SuggestedAction
} from "@/types";

export interface MinimaxDraftInput {
  productName: string;
  companyName: string;
  buyerSignals: string[];
  contactName?: string;
  evidenceSummary?: string;
}

export type ContentModelProviderName = "mock-minimax" | "minimax" | "qwen";

export interface MinimaxDraftOutput {
  subject: string;
  body: string;
  personalizationNotes: string[];
  provider: ContentModelProviderName;
}

export interface BuyerFitScoreInput {
  companyId: string;
  companyName: string;
  country?: string;
  source: "excel_import" | "product_search" | "manual";
  productName?: string;
  productDescription?: string;
  transactionSummary?: string;
  website?: string;
  domain?: string;
  emails?: string[];
  phones?: string[];
  whatsappNumbers?: string[];
  linkedin?: string;
  facebook?: string;
  evidenceSummary: string;
  contactConfidence?: number;
}

export interface BuyerFitScoreOutput {
  buyerFit: BuyerFitTier;
  companyRole: CompanyRole;
  leadScore: number;
  confidence: number;
  reasons: string[];
  risks: string[];
  suggestedAction: SuggestedAction;
  provider?: ContentModelProviderName;
  fallbackReason?: string;
}

export interface ColdEmailInput {
  companyId: string;
  companyName: string;
  country?: string;
  website?: string;
  domain?: string;
  recommendedEmail?: string;
  productName?: string;
  productDescription?: string;
  transactionSummary?: string;
  buyerFit: "high" | "medium" | "low" | "unknown";
  companyRole?: string;
  leadScore?: number;
  suggestedAction?: string;
  evidenceSummary: string;
  reasons?: string[];
  risks?: string[];
  evidenceIds?: string[];
}

export interface ColdEmailOutput {
  subject: string;
  body: string;
  usedEvidenceIds: string[];
  styleNotes: string[];
  provider?: ContentModelProviderName;
  fallbackReason?: string;
}

export interface MinimaxSearchToolContext {
  companyName?: string;
  country?: string;
  website?: string;
  domain?: string;
  productName?: string;
  productDescription?: string;
  transactionSummary?: string;
  sourceKeyword?: string;
}

export interface MinimaxSearchToolInput {
  objective: string;
  context: MinimaxSearchToolContext;
  defaultSearchType?: SearchQueryType;
  mode?: SearchMode;
  providerPriority?: Exclude<SearchProviderName, "mock">[];
  companyId?: EntityId;
  importJobId?: EntityId;
  maxToolCalls?: number;
  minResults?: number;
  minConfidence?: number;
}

export interface MinimaxSearchToolCallResult {
  id: string;
  name: "search_web";
  query: string;
  searchType: SearchQueryType;
  result: RoutedSearchResult;
}

export interface MinimaxSearchToolOutput {
  provider: ContentModelProviderName;
  finalText: string;
  toolCalls: MinimaxSearchToolCallResult[];
  fallbackReason?: string;
}

export interface ProductNameNormalizeInput {
  productInput: string;
}

export interface ProductNameNormalizeOutput {
  originalProduct: string;
  normalizedProduct: string;
  detectedLanguage: "zh" | "en" | "mixed" | "unknown";
  translated: boolean;
  provider?: ContentModelProviderName;
  fallbackReason?: string;
}

export interface ProductKeywordInput {
  productInput: string;
  targetCount: number;
  targetCountries?: string[];
  excludedCountries?: string[];
}

export interface ProductKeywordOutput {
  keyword: string;
  score: number;
  reason: string;
  riskLevel: "low" | "medium" | "high";
}

export type MinimaxProvider = ExternalProvider<MinimaxDraftInput, MinimaxDraftOutput> & {
  normalizeProductName(input: ProductNameNormalizeInput): Promise<ProductNameNormalizeOutput>;
  generateProductKeywords(input: ProductKeywordInput): Promise<ProductKeywordOutput[]>;
  scoreBuyerFit(input: BuyerFitScoreInput): Promise<BuyerFitScoreOutput>;
  generateColdEmail(input: ColdEmailInput): Promise<ColdEmailOutput>;
  searchWithTools(input: MinimaxSearchToolInput): Promise<MinimaxSearchToolOutput>;
};

export function createMinimaxProvider(options: ProviderFactoryOptions = {}): MinimaxProvider {
  const isConfigured = envFlag(process.env.MINIMAX_API_KEY);
  const realModeRequested = process.env.MINIMAX_REAL_MODE === "true";
  const mode = options.mode ?? (isConfigured && realModeRequested ? "real" : "mock");

  return {
    name: "minimax",
    mode,
    isConfigured,
    async invoke(input) {
      return {
        subject: `Diaphragm accumulator supply for ${input.companyName}`,
        body: [
          `Hi ${input.contactName ?? "Procurement Team"},`,
          "",
          `I noticed ${input.companyName} has buyer signals around ${input.buyerSignals.join(", ")}.`,
          input.evidenceSummary ? `Evidence summary: ${input.evidenceSummary}` : "",
          `We manufacture ${input.productName} and related export parts for importers and distributors.`,
          "",
          "Could I send a short catalog and learn which pressure range you usually purchase?",
          "",
          "Best regards,"
        ].join("\n"),
        personalizationNotes: input.buyerSignals,
        provider: mode === "real" ? "minimax" : "mock-minimax"
      };
    },
    async normalizeProductName(input) {
      const fallback = mockNormalizeProductName(input.productInput);
      if (!needsProductTranslation(input.productInput)) {
        return {
          ...fallback,
          provider: mode === "real" ? "minimax" : "mock-minimax"
        };
      }

      if (mode !== "real" || !isConfigured) {
        return {
          ...fallback,
          provider: "mock-minimax",
          fallbackReason: isConfigured
            ? "MiniMax real mode is disabled; used local product-name normalization."
            : "MINIMAX_API_KEY is empty; used local product-name normalization."
        };
      }

      try {
        return {
          ...(await callMiniMaxNormalizeProductName(input)),
          provider: "minimax"
        };
      } catch (error) {
        return {
          ...fallback,
          provider: "mock-minimax",
          fallbackReason:
            error instanceof Error
              ? `MiniMax product normalization failed: ${error.message}`
              : "MiniMax product normalization failed with an unknown error."
        };
      }
    },
    async generateProductKeywords(input) {
      const normalized = await this.normalizeProductName({
        productInput: input.productInput
      });
      const fallback = mockGenerateProductKeywords({
        ...input,
        productInput: normalized.normalizedProduct
      });

      if (mode !== "real" || !isConfigured) return fallback;

      try {
        return await callMiniMaxGenerateProductKeywords({
          ...input,
          productInput: normalized.normalizedProduct
        });
      } catch {
        return fallback;
      }
    },
    async scoreBuyerFit(input) {
      if (mode !== "real" || !isConfigured) {
        return {
          ...mockScoreBuyerFit(input),
          provider: "mock-minimax",
          fallbackReason: isConfigured
            ? "MiniMax real mode is disabled; using local evidence-based mock scoring."
            : "MINIMAX_API_KEY is empty; using local evidence-based mock scoring."
        };
      }

      try {
        return {
          ...(await callMiniMaxBuyerFit(input)),
          provider: "minimax"
        };
      } catch (error) {
        return {
          ...mockScoreBuyerFit(input),
          provider: "mock-minimax",
          fallbackReason:
            error instanceof Error
              ? `MiniMax scoring failed: ${error.message}`
              : "MiniMax scoring failed with an unknown error."
        };
      }
    },
    async generateColdEmail(input) {
      if (mode !== "real" || !isConfigured) {
        return {
          ...mockGenerateColdEmail(input),
          provider: "mock-minimax",
          fallbackReason: isConfigured
            ? "MiniMax real mode is disabled; using local evidence-based mock email."
            : "MINIMAX_API_KEY is empty; using local evidence-based mock email."
        };
      }

      try {
        return {
          ...(await callMiniMaxColdEmail(input)),
          provider: "minimax"
        };
      } catch (error) {
        return {
          ...mockGenerateColdEmail(input),
          provider: "mock-minimax",
          fallbackReason:
            error instanceof Error
              ? `MiniMax email generation failed: ${error.message}`
              : "MiniMax email generation failed with an unknown error."
        };
      }
    },
    async searchWithTools(input) {
      if (mode !== "real" || !isConfigured) {
        return {
          provider: "mock-minimax",
          finalText: "",
          toolCalls: [],
          fallbackReason: isConfigured
            ? "MiniMax real mode is disabled; skipped MiniMax tool-use search."
            : "MINIMAX_API_KEY is empty; skipped MiniMax tool-use search."
        };
      }

      try {
        return {
          ...(await callMiniMaxSearchWithTools(input)),
          provider: "minimax"
        };
      } catch (error) {
        return {
          provider: "mock-minimax",
          finalText: "",
          toolCalls: [],
          fallbackReason:
            error instanceof Error
              ? `MiniMax tool-use search failed: ${error.message}`
              : "MiniMax tool-use search failed with an unknown error."
        };
      }
    }
  };
}

async function callMiniMaxNormalizeProductName(
  input: ProductNameNormalizeInput
): Promise<ProductNameNormalizeOutput> {
  await enforceMiniMaxRateLimit();
  const response = await fetchWithTimeout(resolveMiniMaxChatEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MINIMAX_API_KEY ?? ""}`
      },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL || "abab6.5s-chat",
        messages: [
          {
            role: "system",
            content: [
              "You normalize product names for B2B export lead search.",
              "Return only valid JSON: { originalProduct, normalizedProduct, detectedLanguage, translated }.",
              "If the input is Chinese, translate it into a concise English product search phrase.",
              "Keep the normalized product literal and specific. Do not add buyer words like importer, distributor, supplier, or contact.",
              "Do not invent extra product categories that are not implied by the input."
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify(input, null, 2)
          }
        ],
        temperature: 0,
        response_format: {
          type: "json_object"
        }
      })
    }, 20_000);

  if (!response.ok) {
    throw new Error(`MiniMax API returned ${response.status}`);
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    reply?: string;
    output?: string;
  };
  const content = raw.choices?.[0]?.message?.content ?? raw.reply ?? raw.output ?? "";
  return normalizeProductNameOutput(JSON.parse(extractJson(content)), input.productInput);
}

async function callMiniMaxGenerateProductKeywords(
  input: ProductKeywordInput
): Promise<ProductKeywordOutput[]> {
  await enforceMiniMaxRateLimit();
  const response = await fetchWithTimeout(resolveMiniMaxChatEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MINIMAX_API_KEY ?? ""}`
      },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL || "abab6.5s-chat",
        messages: [
          {
            role: "system",
            content: [
              "You generate concise English B2B search keywords for export lead generation.",
              "Return only valid JSON: { keywords: [{ keyword, score, reason, riskLevel }] }.",
              "If the product input was translated from Chinese, use the English product phrase.",
              "Keywords must be specific to the product and suitable for finding importers, distributors, dealers, repair/service companies, or industrial buyers.",
              "Do not include company names. Do not invent customer facts.",
              "Avoid overly broad or unrelated terms.",
              "Generate 6-10 keywords."
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify(input, null, 2)
          }
        ],
        temperature: 0.15,
        response_format: {
          type: "json_object"
        }
      })
    }, 25_000);

  if (!response.ok) {
    throw new Error(`MiniMax API returned ${response.status}`);
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    reply?: string;
    output?: string;
  };
  const content = raw.choices?.[0]?.message?.content ?? raw.reply ?? raw.output ?? "";
  const parsed = JSON.parse(extractJson(content)) as { keywords?: Partial<ProductKeywordOutput>[] };
  return normalizeProductKeywords(parsed.keywords, input.productInput);
}

async function callMiniMaxBuyerFit(input: BuyerFitScoreInput): Promise<BuyerFitScoreOutput> {
  await enforceMiniMaxRateLimit();
  const response = await fetchWithTimeout(resolveMiniMaxChatEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MINIMAX_API_KEY ?? ""}`
      },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL || "abab6.5s-chat",
        messages: [
          {
            role: "system",
            content: buildBuyerFitSystemPrompt()
          },
          {
            role: "user",
            content: JSON.stringify(input, null, 2)
          }
        ],
        temperature: 0.1,
        response_format: {
          type: "json_object"
        }
      })
    }, 30_000);

  if (!response.ok) {
    throw new Error(`MiniMax API returned ${response.status}`);
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    reply?: string;
    output?: string;
  };
  const content = raw.choices?.[0]?.message?.content ?? raw.reply ?? raw.output ?? "";
  return normalizeBuyerFitOutput(JSON.parse(extractJson(content)));
}

function buildBuyerFitSystemPrompt() {
  return [
    "You are scoring B2B buyer fit for export lead generation.",
    "Return only valid JSON matching the requested schema.",
    "Use only the evidence in the user JSON. Do not invent websites, emails, phones, WhatsApp, LinkedIn, or Facebook.",
    "Scoring rules:",
    "1. Relevant product description or transaction record increases score.",
    "2. Website/domain matching the company name increases score.",
    "3. Email domain matching the website domain increases score.",
    "4. Purchase/procurement/sourcing emails increase score.",
    "5. WhatsApp availability increases score.",
    "6. More independent evidence sources increase confidence.",
    "7. Only third-party directory evidence lowers confidence.",
    "8. Insufficient evidence should be unknown or medium with lower confidence.",
    "9. Clearly unrelated industry should be low.",
    "10. No website, no email, and no contact channel should suggest manual_review or skip."
  ].join("\n");
}

async function callMiniMaxColdEmail(input: ColdEmailInput): Promise<ColdEmailOutput> {
  await enforceMiniMaxRateLimit();
  const response = await fetchWithTimeout(resolveMiniMaxChatEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MINIMAX_API_KEY ?? ""}`
      },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL || "abab6.5s-chat",
        messages: [
          {
            role: "system",
            content: buildColdEmailSystemPrompt()
          },
          {
            role: "user",
            content: JSON.stringify(input, null, 2)
          }
        ],
        temperature: 0.25,
        response_format: {
          type: "json_object"
        }
      })
    }, 30_000);

  if (!response.ok) {
    throw new Error(`MiniMax API returned ${response.status}`);
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    reply?: string;
    output?: string;
  };
  const content = raw.choices?.[0]?.message?.content ?? raw.reply ?? raw.output ?? "";
  return normalizeColdEmailOutput(JSON.parse(extractJson(content)), input.evidenceIds ?? []);
}

function buildColdEmailSystemPrompt() {
  return [
    "You write first-touch B2B cold emails in English.",
    "Return only valid JSON: { subject, body, usedEvidenceIds, styleNotes }.",
    "Use only the user JSON evidence. Do not invent customer facts, websites, emails, WhatsApp, transaction records, or contact details.",
    "Style rules:",
    "1. English.",
    "2. Sound like a real person.",
    "3. Short sentences.",
    "4. No AI-ish tone.",
    "5. Do not be overly polite.",
    "6. No long complex sentences.",
    "7. No repetitive parallel phrasing.",
    "8. Do not make up customer situations.",
    "9. Must use saved evidence.",
    "10. First email must be 5-7 sentences.",
    "11. Subject must be short and direct.",
    "Banned phrases:",
    "I hope this email finds you well",
    "I am writing to",
    "please feel free to",
    "we are a leading manufacturer",
    "we specialize in providing high quality solutions",
    "I would like to introduce our company"
  ].join("\n");
}

function resolveMiniMaxChatEndpoint() {
  const configuredBaseUrl = process.env.MINIMAX_BASE_URL?.trim() || "https://api.minimaxi.com/v1";
  const url = new URL(configuredBaseUrl);
  const normalizedPath = url.pathname.replace(/\/$/, "");

  if (/\/(chat\/completions|text\/chatcompletion_v2)$/i.test(normalizedPath)) {
    return url.toString();
  }

  url.pathname = `${normalizedPath}/chat/completions`;
  return url.toString();
}

type MiniMaxChatToolCall = {
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
};

type MiniMaxChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: MiniMaxChatToolCall[];
  tool_call_id?: string;
  name?: string;
  function_call?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
};

type MiniMaxToolRequest = {
  id: string;
  name: "search_web";
  query: string;
  searchType?: SearchQueryType;
};

async function callMiniMaxSearchWithTools(
  input: MinimaxSearchToolInput
): Promise<Omit<MinimaxSearchToolOutput, "provider">> {
  const maxToolCalls = Math.max(1, Math.min(input.maxToolCalls ?? 2, 4));
  const messages: MiniMaxChatMessage[] = [
    {
      role: "system",
      content: buildSearchToolSystemPrompt()
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          objective: input.objective,
          context: input.context,
          instructions: [
            "Call search_web only when fresh public web evidence is needed.",
            "Prefer precise queries with company/product/country terms.",
            "Do not fabricate websites, emails, phone numbers, WhatsApp, LinkedIn, or Facebook.",
            "Base final answer only on search_web results returned by the tool."
          ]
        },
        null,
        2
      )
    }
  ];
  const toolCalls: MinimaxSearchToolCallResult[] = [];

  for (let turn = 0; turn <= maxToolCalls; turn += 1) {
    await enforceMiniMaxRateLimit();
    const response = await fetchWithTimeout(resolveMiniMaxChatEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MINIMAX_API_KEY ?? ""}`
      },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL || "MiniMax-M3",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "search_web",
              description:
                "Search the public web through the application's configured SearchProviderRouter. Use this for current company, website, contact, social, or product-buyer discovery evidence.",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "A concise public web search query."
                  },
                  searchType: {
                    type: "string",
                    enum: ["website", "contact", "email", "phone", "whatsapp", "social"],
                    description: "The kind of evidence needed from this search."
                  }
                },
                required: ["query"]
              }
            }
          }
        ],
        tool_choice: "auto",
        temperature: 0.1
      })
    }, 30_000);

    if (!response.ok) {
      throw new Error(`MiniMax tool-use API returned ${response.status}`);
    }

    const raw = (await response.json()) as {
      choices?: Array<{ message?: MiniMaxChatMessage }>;
      reply?: string;
      output?: string;
    };
    const message = raw.choices?.[0]?.message ?? {
      role: "assistant" as const,
      content: raw.reply ?? raw.output ?? ""
    };
    const toolRequests = extractSearchToolRequests(message, input.defaultSearchType);

    if (toolRequests.length === 0 || toolCalls.length >= maxToolCalls) {
      return {
        finalText: contentToString(message.content),
        toolCalls
      };
    }

    messages.push({
      role: "assistant",
      content: contentToString(message.content),
      tool_calls: toolRequests.map((request) => ({
        id: request.id,
        type: "function",
        function: {
          name: request.name,
          arguments: JSON.stringify({
            query: request.query,
            searchType: request.searchType
          })
        }
      }))
    });

    for (const request of toolRequests.slice(0, maxToolCalls - toolCalls.length)) {
      const result = await runSearchWebTool(input, request);
      toolCalls.push(result);
      messages.push({
        role: "tool",
        tool_call_id: request.id,
        name: request.name,
        content: JSON.stringify(summarizeSearchToolResult(result), null, 2)
      });
    }
  }

  return {
    finalText: "",
    toolCalls
  };
}

function buildSearchToolSystemPrompt() {
  return [
    "You are a B2B export lead research assistant.",
    "You do not have built-in web access. When current public information is needed, call the search_web tool.",
    "The application will execute search_web through EXA, Tavily, or YOU via SearchProviderRouter.",
    "Never claim you searched unless tool results are provided.",
    "Never invent websites, emails, phones, WhatsApp numbers, LinkedIn, Facebook, or buyer facts.",
    "Use the fewest useful searches. One precise search is preferred; request another only if results are weak or a different evidence type is needed."
  ].join("\n");
}

async function runSearchWebTool(
  input: MinimaxSearchToolInput,
  request: MiniMaxToolRequest
): Promise<MinimaxSearchToolCallResult> {
  const searchType = request.searchType ?? inferSearchTypeFromQuery(request.query, input.defaultSearchType);
  const result = await searchProviderRouter.search({
    query: request.query,
    searchType,
    mode: input.mode ?? "fallback",
    providerPriority: input.providerPriority,
    companyId: input.companyId,
    importJobId: input.importJobId,
    websiteInput:
      searchType === "website"
        ? {
            companyName: input.context.companyName || request.query,
            country: input.context.country,
            sourceKeyword: input.context.sourceKeyword ?? input.context.productDescription ?? input.context.productName
          }
        : undefined,
    contactInput:
      searchType !== "website"
        ? {
            companyName: input.context.companyName || request.query,
            country: input.context.country,
            website: input.context.website
          }
        : undefined,
    minResults: input.minResults,
    minConfidence: input.minConfidence
  });

  return {
    id: request.id,
    name: request.name,
    query: request.query,
    searchType,
    result
  };
}

function extractSearchToolRequests(
  message: MiniMaxChatMessage,
  defaultSearchType?: SearchQueryType
): MiniMaxToolRequest[] {
  const structuredToolCalls = (message.tool_calls ?? [])
    .filter((toolCall) => toolCall.function?.name === "search_web")
    .flatMap((toolCall, index) => {
      const args = parseToolArguments(toolCall.function?.arguments);
      const query = sanitizeSearchQuery(args.query);
      if (!query) return [];

      return [
        {
          id: toolCall.id ?? `search_web_${Date.now()}_${index}`,
          name: "search_web" as const,
          query,
          searchType: normalizeSearchType(args.searchType, defaultSearchType)
        }
      ];
    });

  if (structuredToolCalls.length > 0) return structuredToolCalls;

  if (message.function_call?.name === "search_web") {
    const args = parseToolArguments(message.function_call.arguments);
    const query = sanitizeSearchQuery(args.query);
    if (query) {
      return [
        {
          id: `search_web_${Date.now()}_0`,
          name: "search_web",
          query,
          searchType: normalizeSearchType(args.searchType, defaultSearchType)
        }
      ];
    }
  }

  return extractTextToolCalls(contentToString(message.content), defaultSearchType);
}

function extractTextToolCalls(content: string, defaultSearchType?: SearchQueryType) {
  const calls: MiniMaxToolRequest[] = [];
  const pattern = /search_web\s*\(\s*(\{[\s\S]*?\})\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const args = parseToolArguments(match[1]);
    const query = sanitizeSearchQuery(args.query);
    if (!query) continue;
    calls.push({
      id: `search_web_text_${Date.now()}_${calls.length}`,
      name: "search_web",
      query,
      searchType: normalizeSearchType(args.searchType, defaultSearchType)
    });
  }

  return calls;
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sanitizeSearchQuery(value: unknown) {
  const query = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!query || query.length < 2) return "";
  return query.slice(0, 240);
}

function normalizeSearchType(value: unknown, fallback?: SearchQueryType): SearchQueryType | undefined {
  const normalized = String(value ?? "").toLowerCase();
  if (["website", "contact", "email", "phone", "whatsapp", "social"].includes(normalized)) {
    return normalized as SearchQueryType;
  }
  return fallback;
}

function inferSearchTypeFromQuery(query: string, fallback: SearchQueryType = "contact"): SearchQueryType {
  if (/whatsapp|wa\.me/i.test(query)) return "whatsapp";
  if (/linkedin|facebook/i.test(query)) return "social";
  if (/official website|company website|homepage|domain/i.test(query)) return "website";
  if (/email/i.test(query)) return "email";
  if (/phone|telephone|tel\b/i.test(query)) return "phone";
  return fallback;
}

function summarizeSearchToolResult(call: MinimaxSearchToolCallResult) {
  return {
    query: call.query,
    searchType: call.searchType,
    provider: call.result.provider,
    attempts: call.result.attempts.map((attempt) => ({
      provider: attempt.provider,
      status: attempt.status,
      resultCount: attempt.resultCount,
      averageConfidence: attempt.averageConfidence,
      fallbackReason: attempt.fallbackReason,
      errorMessage: attempt.errorMessage
    })),
    websiteResults: call.result.websiteResults.slice(0, 5).map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      confidence: result.confidence,
      sourceProvider: result.sourceProvider
    })),
    contactResults: call.result.contactResults.slice(0, 8).map((result) => ({
      type: result.type,
      value: result.value,
      sourceUrl: result.sourceUrl,
      evidenceText: result.evidenceText,
      confidence: result.confidence,
      sourceProvider: result.sourceProvider
    })),
    errors: call.result.errors
  };
}

function contentToString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object" && "text" in item
            ? String((item as { text?: unknown }).text ?? "")
            : ""
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function mockGenerateColdEmail(input: ColdEmailInput): ColdEmailOutput {
  const product = input.productDescription || input.productName || "your product category";
  const evidenceLine = input.transactionSummary
    ? `I saw a record tied to ${product}, so I thought this might be relevant.`
    : input.reasons?.[0]
      ? input.reasons[0]
      : `I found ${product} in the saved evidence for your company.`;
  const roleLine =
    input.companyRole && input.companyRole !== "unknown"
      ? `It looks close to a ${input.companyRole.replace(/_/g, " ")} profile.`
      : "The match is not perfect, so I kept this short.";
  const body = [
    `Hi ${input.companyName} team,`,
    evidenceLine,
    roleLine,
    `We make ${product} and related export parts for buyers who need stable supply.`,
    "Could you tell me who handles supplier review for this item?",
    "If it is relevant, I can send a short catalog and basic specs."
  ].join("\n");

  return {
    subject: `${product} supply`,
    body: removeBannedPhrases(body),
    usedEvidenceIds: input.evidenceIds?.slice(0, 8) ?? [],
    styleNotes: [
      "English first-touch email.",
      "5-7 short sentences.",
      "Only used saved evidence and Buyer Fit reasons."
    ]
  };
}

function normalizeColdEmailOutput(value: Partial<ColdEmailOutput>, fallbackEvidenceIds: string[]) {
  return {
    subject: sanitizeSubject(value.subject),
    body: sanitizeEmailBody(value.body),
    usedEvidenceIds:
      Array.isArray(value.usedEvidenceIds) && value.usedEvidenceIds.length > 0
        ? value.usedEvidenceIds.map(String)
        : fallbackEvidenceIds.slice(0, 8),
    styleNotes: normalizeStringArray(value.styleNotes, ["MiniMax generated a short evidence-based email."])
  };
}

function sanitizeSubject(value: unknown) {
  const subject = String(value ?? "Quick question").replace(/\s+/g, " ").trim();
  return removeBannedPhrases(subject).slice(0, 90) || "Quick question";
}

function sanitizeEmailBody(value: unknown) {
  const body = String(value ?? "").trim();
  const sanitized = removeBannedPhrases(body);
  return sanitized || "Hi,\nI found a saved buyer signal for your company.\nCould you tell me who reviews suppliers for this item?";
}

function removeBannedPhrases(value: string) {
  return [
    /I hope this email finds you well\.?/gi,
    /I am writing to/gi,
    /please feel free to/gi,
    /we are a leading manufacturer/gi,
    /we specialize in providing high quality solutions/gi,
    /I would like to introduce our company/gi
  ].reduce((text, pattern) => text.replace(pattern, "").replace(/[ \t]{2,}/g, " "), value).trim();
}

function mockScoreBuyerFit(input: BuyerFitScoreInput): BuyerFitScoreOutput {
  // Local fallback applies the same evidence-only scoring rules as the MiniMax prompt.
  const emails = input.emails ?? [];
  const phones = input.phones ?? [];
  const whatsapps = input.whatsappNumbers ?? [];
  const websiteDomain = input.domain || extractDomain(input.website);
  const hasProductEvidence = Boolean(input.productDescription || input.transactionSummary);
  const websiteMatchesCompany = Boolean(websiteDomain && domainMatchesCompany(websiteDomain, input.companyName));
  const hasMatchingEmailDomain = emails.some((email) => emailDomainMatchesWebsite(email, input.website));
  const hasProcurementEmail = emails.some((email) =>
    /^(purchase|procurement|sourcing)[._-]?/i.test(email.split("@")[0] ?? "")
  );
  const hasAnyContact = emails.length > 0 || phones.length > 0 || whatsapps.length > 0;
  const thirdPartyOnly = /third-party|directory|linkedin|facebook|alibaba|panjiva|importgenius/i.test(
    input.evidenceSummary
  ) && !input.website;
  let score = 35;
  const reasons: string[] = [];
  const risks: string[] = [];

  if (hasProductEvidence) {
    score += 18;
    reasons.push("Product description or transaction evidence is available.");
  } else {
    risks.push("No product description or transaction record was available.");
  }
  if (websiteMatchesCompany) {
    score += 14;
    reasons.push("Website/domain appears to match the company name.");
  } else if (input.website) {
    score += 6;
    reasons.push("A website candidate is available, but domain match is weak.");
    risks.push("Website/company-name match needs review.");
  } else {
    risks.push("No official website evidence was found.");
  }
  if (hasMatchingEmailDomain) {
    score += 12;
    reasons.push("At least one email domain matches the website domain.");
  }
  if (hasProcurementEmail) {
    score += 12;
    reasons.push("Procurement-oriented email evidence was found.");
  } else if (emails.length > 0) {
    score += 6;
    reasons.push("Public email evidence was found.");
  } else {
    risks.push("No public email evidence was found.");
  }
  if (whatsapps.length > 0) {
    score += 8;
    reasons.push("WhatsApp contact evidence was found.");
  }
  if (thirdPartyOnly) {
    score -= 16;
    risks.push("Evidence appears to rely mainly on third-party directory sources.");
  }
  if (!hasAnyContact) {
    score -= 12;
    risks.push("No email, phone, or WhatsApp contact evidence was found.");
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const buyerFit = scoreToTier(boundedScore, hasProductEvidence, hasAnyContact);
  const confidence = confidenceFromEvidence({
    contactConfidence: input.contactConfidence,
    evidenceSummary: input.evidenceSummary,
    hasProductEvidence,
    websiteMatchesCompany,
    hasAnyContact,
    thirdPartyOnly
  });
  const suggestedAction = suggestedActionFor({
    buyerFit,
    hasEmail: emails.length > 0,
    hasWhatsapp: whatsapps.length > 0,
    hasAnyContact,
    confidence
  });

  return {
    buyerFit,
    companyRole: inferCompanyRole(input),
    leadScore: boundedScore,
    confidence,
    reasons: reasons.length > 0 ? reasons.slice(0, 5) : ["Evidence is limited; conservative score assigned."],
    risks: risks.length > 0 ? risks.slice(0, 5) : ["No major evidence risks detected."],
    suggestedAction
  };
}

function normalizeBuyerFitOutput(value: Partial<BuyerFitScoreOutput>): BuyerFitScoreOutput {
  const leadScore = clampNumber(value.leadScore, 0, 100, 45);
  const confidence = clampNumber(value.confidence, 0, 1, 0.5);

  return {
    buyerFit: isBuyerFit(value.buyerFit) ? value.buyerFit : scoreToTier(leadScore, true, true),
    companyRole: isCompanyRole(value.companyRole) ? value.companyRole : "unknown",
    leadScore,
    confidence,
    reasons: normalizeStringArray(value.reasons, ["MiniMax returned limited scoring reasons."]),
    risks: normalizeStringArray(value.risks, ["MiniMax returned limited risk notes."]),
    suggestedAction: isSuggestedAction(value.suggestedAction)
      ? value.suggestedAction
      : confidence < 0.55
        ? "manual_review"
        : "email_first"
  };
}

function scoreToTier(score: number, hasProductEvidence: boolean, hasAnyContact: boolean): BuyerFitTier {
  if (!hasProductEvidence && !hasAnyContact) return "unknown";
  if (score >= 78) return "high";
  if (score >= 55) return "medium";
  if (score >= 35) return "low";
  return "unknown";
}

function confidenceFromEvidence(input: {
  contactConfidence?: number;
  evidenceSummary: string;
  hasProductEvidence: boolean;
  websiteMatchesCompany: boolean;
  hasAnyContact: boolean;
  thirdPartyOnly: boolean;
}) {
  let confidence = 0.36;
  if (input.hasProductEvidence) confidence += 0.14;
  if (input.websiteMatchesCompany) confidence += 0.14;
  if (input.hasAnyContact) confidence += 0.12;
  if ((input.contactConfidence ?? 0) >= 70) confidence += 0.1;
  if (input.evidenceSummary.length > 120) confidence += 0.08;
  if (input.thirdPartyOnly) confidence -= 0.18;
  return Math.max(0.2, Math.min(0.95, Number(confidence.toFixed(2))));
}

function suggestedActionFor(input: {
  buyerFit: BuyerFitTier;
  hasEmail: boolean;
  hasWhatsapp: boolean;
  hasAnyContact: boolean;
  confidence: number;
}): SuggestedAction {
  if (!input.hasAnyContact || input.confidence < 0.45) return input.buyerFit === "low" ? "skip" : "manual_review";
  if (input.buyerFit === "low" || input.buyerFit === "unknown") return "manual_review";
  if (input.hasEmail) return "email_first";
  if (input.hasWhatsapp) return "whatsapp_first";
  return "manual_review";
}

function inferCompanyRole(input: BuyerFitScoreInput): CompanyRole {
  const text = `${input.companyName} ${input.productDescription ?? ""} ${input.transactionSummary ?? ""} ${input.evidenceSummary}`.toLowerCase();
  if (/importer|import|buyer|purchase|procurement/.test(text)) return "importer";
  if (/distributor|distribution|reseller|dealer/.test(text)) return "distributor";
  if (/trading|trade co|export import/.test(text)) return "trading_company";
  if (/manufacturer|factory|producer/.test(text)) return "manufacturer";
  if (/end user|plant|facility|maintenance/.test(text)) return "end_user";
  return "unknown";
}

function mockNormalizeProductName(productInput: string): ProductNameNormalizeOutput {
  const originalProduct = productInput.trim().replace(/\s+/g, " ");
  const detectedLanguage = detectProductLanguage(originalProduct);
  const dictionaryMatch = productTranslationDictionary.find((entry) => entry.pattern.test(originalProduct));
  const normalizedProduct = dictionaryMatch?.english ?? normalizeEnglishProductName(originalProduct);

  return {
    originalProduct,
    normalizedProduct,
    detectedLanguage,
    translated: detectedLanguage === "zh" || detectedLanguage === "mixed"
  };
}

function mockGenerateProductKeywords(input: ProductKeywordInput): ProductKeywordOutput[] {
  const product = normalizeEnglishProductName(input.productInput) || "industrial product";
  const tokens = product
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3)
    .slice(0, 4);
  const productCore = tokens.join(" ") || product;
  const rawKeywords = [
    product,
    `${productCore} importer`,
    `${productCore} distributor`,
    `${productCore} dealer`,
    `${productCore} supplier contact`,
    `${productCore} procurement`,
    `${productCore} repair service`,
    `${productCore} industrial buyer`
  ];

  return dedupeKeywordOutputs(rawKeywords).map((keyword, index) => ({
    keyword,
    score: Math.max(0.68, Number((0.94 - index * 0.04).toFixed(2))),
    reason:
      index === 0
        ? "Exact normalized product phrase for high precision."
        : "Local fallback keyword with B2B buyer intent.",
    riskLevel: index <= 3 ? "low" : "medium"
  }));
}

function normalizeProductKeywords(
  value: Partial<ProductKeywordOutput>[] | undefined,
  fallbackProduct: string
): ProductKeywordOutput[] {
  const fallback = mockGenerateProductKeywords({
    productInput: fallbackProduct,
    targetCount: 20
  });
  if (!Array.isArray(value) || value.length === 0) return fallback;

  const normalized = value
    .map((item) => ({
      keyword: normalizeEnglishProductName(item.keyword),
      score: clampNumber(item.score, 0, 1, 0.75),
      reason: String(item.reason ?? "MiniMax keyword for B2B product search."),
      riskLevel: isKeywordRiskLevel(item.riskLevel) ? item.riskLevel : ("medium" as const)
    }))
    .filter((item) => item.keyword.length >= 3 && item.keyword.split(/\s+/).length <= 8);

  const seen = new Set<string>();
  const unique = normalized.filter((item) => {
    if (seen.has(item.keyword)) return false;
    seen.add(item.keyword);
    return true;
  });

  return unique.length > 0 ? unique.slice(0, 10) : fallback;
}

function dedupeKeywordOutputs(items: string[]) {
  return Array.from(new Set(items.map((item) => normalizeEnglishProductName(item)).filter(Boolean))).slice(0, 10);
}

function isKeywordRiskLevel(value: unknown): value is ProductKeywordOutput["riskLevel"] {
  return value === "low" || value === "medium" || value === "high";
}

function normalizeProductNameOutput(
  value: Partial<ProductNameNormalizeOutput>,
  fallbackInput: string
): ProductNameNormalizeOutput {
  const fallback = mockNormalizeProductName(fallbackInput);
  const normalizedProduct = normalizeEnglishProductName(value.normalizedProduct ?? fallback.normalizedProduct);

  return {
    originalProduct: String(value.originalProduct ?? fallback.originalProduct).trim() || fallback.originalProduct,
    normalizedProduct: normalizedProduct || fallback.normalizedProduct,
    detectedLanguage: isProductLanguage(value.detectedLanguage) ? value.detectedLanguage : fallback.detectedLanguage,
    translated: typeof value.translated === "boolean" ? value.translated : fallback.translated
  };
}

function needsProductTranslation(productInput: string) {
  return /[\u3400-\u9fff]/.test(productInput);
}

function detectProductLanguage(productInput: string): ProductNameNormalizeOutput["detectedLanguage"] {
  const hasChinese = /[\u3400-\u9fff]/.test(productInput);
  const hasLatin = /[a-z]/i.test(productInput);
  if (hasChinese && hasLatin) return "mixed";
  if (hasChinese) return "zh";
  if (hasLatin) return "en";
  return "unknown";
}

function normalizeEnglishProductName(value: unknown) {
  return String(value ?? "")
    .replace(/\b(importer|distributor|supplier|dealer|contact|wholesale|buyer|manufacturer)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isProductLanguage(value: unknown): value is ProductNameNormalizeOutput["detectedLanguage"] {
  return ["zh", "en", "mixed", "unknown"].includes(String(value));
}

const productTranslationDictionary = [
  { pattern: /隔膜.*蓄能器|蓄能器.*隔膜/i, english: "diaphragm accumulator" },
  { pattern: /皮囊.*蓄能器|气囊.*蓄能器/i, english: "bladder accumulator" },
  { pattern: /活塞.*蓄能器/i, english: "piston accumulator" },
  { pattern: /液压.*蓄能器|蓄能器/i, english: "hydraulic accumulator" },
  { pattern: /液压泵/i, english: "hydraulic pump" },
  { pattern: /液压阀|换向阀|比例阀|电磁阀/i, english: "hydraulic valve" },
  { pattern: /密封件|油封|密封圈/i, english: "hydraulic seals" },
  { pattern: /过滤器|滤芯/i, english: "hydraulic filter element" },
  { pattern: /液压缸|油缸/i, english: "hydraulic cylinder" },
  { pattern: /压力表/i, english: "pressure gauge" }
];

function extractJson(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("MiniMax response did not contain JSON.");
  return match[0];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean).slice(0, 8)
    : fallback;
}

function isBuyerFit(value: unknown): value is BuyerFitTier {
  return ["high", "medium", "low", "unknown"].includes(String(value));
}

function isCompanyRole(value: unknown): value is CompanyRole {
  return [
    "importer",
    "distributor",
    "trading_company",
    "manufacturer",
    "end_user",
    "unknown"
  ].includes(String(value));
}

function isSuggestedAction(value: unknown): value is SuggestedAction {
  return ["email_first", "whatsapp_first", "manual_review", "skip"].includes(String(value));
}

async function enforceMiniMaxRateLimit() {
  const result = await consumeRateLimit({
    policy: "minimax",
    subject: "minimax"
  });

  if (!result.allowed) {
    throw new Error(`MiniMax rate limit reached. Retry after ${result.retryAfterSeconds}s.`);
  }
}

export const minimaxProvider = createMinimaxProvider();
