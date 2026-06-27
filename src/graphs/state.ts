import { Annotation } from "@langchain/langgraph";

export type LeadGenerationNode =
  | "normalizeInput"
  | "generateKeywords"
  | "humanApproveKeywords"
  | "searchCrossBorderImporters"
  | "extractCompanyDetails"
  | "discoverWebsite"
  | "searchEmailsByDomain"
  | "discoverWhatsappAndContacts"
  | "scoreBuyerFit"
  | "generateEmailDraft"
  | "humanApproveEmail"
  | "saveToCrm";

export type GraphStepStatus = "pending" | "running" | "waiting_review" | "completed" | "failed";

export interface GraphLog {
  step: LeadGenerationNode;
  status: GraphStepStatus;
  message: string;
  timestamp: string;
}

export interface LeadCandidate {
  companyName: string;
  country: string;
  city: string;
  website?: string;
  products: string[];
  importerProfile: string;
  matchedKeyword: string;
}

export interface KeywordInsight {
  value: string;
  score: number;
  reason: string;
}

export interface GraphEvidence {
  type:
    | "cross_search_mock"
    | "website_mock"
    | "website_search"
    | "email_mock"
    | "whatsapp_mock"
    | "contact_search"
    | "buyer_fit_mock"
    | "email_draft_mock";
  title: string;
  url?: string;
  snippet: string;
  source?: string;
  rawText?: string;
  confidence: number;
}

export interface GraphCompany {
  id: string;
  name: string;
  country: string;
  city: string;
  website: string;
  domain: string;
  products: string[];
  importerProfile: string;
  sourceKeyword: string;
  contactName?: string;
  contactTitle?: string;
  phone?: string;
  whatsapp?: string;
  linkedin?: string;
  facebook?: string;
  emails: string[];
  buyerFitScore?: number;
  leadScore?: number;
  confidence?: number;
  buyerFitReasons: string[];
  evidence: GraphEvidence[];
}

export interface GraphEmailDraft {
  id?: string;
  companyId: string;
  to: string;
  toEmail?: string;
  subject: string;
  body: string;
  status: "draft" | "waiting_review" | "approved" | "skipped" | "saved";
  approvedAt?: string;
  skippedAt?: string;
  editedAt?: string;
  personalizationNotes: string[];
}

export interface LeadGenerationState {
  runId: string;
  productInput: string;
  targetCount: number;
  normalizedProduct?: string;
  keywords: string[];
  keywordInsights: KeywordInsight[];
  approvedKeywords: string[];
  candidates: LeadCandidate[];
  companies: GraphCompany[];
  emailDrafts: GraphEmailDraft[];
  currentStep?: LeadGenerationNode;
  progress: Record<LeadGenerationNode, GraphStepStatus>;
  errors: string[];
  logs: GraphLog[];
}

export const leadGenerationNodes: LeadGenerationNode[] = [
  "normalizeInput",
  "generateKeywords",
  "humanApproveKeywords",
  "searchCrossBorderImporters",
  "extractCompanyDetails",
  "discoverWebsite",
  "searchEmailsByDomain",
  "discoverWhatsappAndContacts",
  "scoreBuyerFit",
  "generateEmailDraft",
  "humanApproveEmail",
  "saveToCrm"
];

export const leadGenerationNodeLabels: Record<LeadGenerationNode, string> = {
  normalizeInput: "Normalize input",
  generateKeywords: "Generate keywords",
  humanApproveKeywords: "Human approve keywords",
  searchCrossBorderImporters: "Search cross-border importers",
  extractCompanyDetails: "Extract company details",
  discoverWebsite: "Discover website",
  searchEmailsByDomain: "Search emails by domain",
  discoverWhatsappAndContacts: "Discover WhatsApp and contacts",
  scoreBuyerFit: "Score Buyer Fit",
  generateEmailDraft: "Generate email draft",
  humanApproveEmail: "Human approve email",
  saveToCrm: "Save to CRM"
};

export const LeadGenerationAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  productInput: Annotation<string>(),
  targetCount: Annotation<number>(),
  normalizedProduct: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined
  }),
  keywords: Annotation<string[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  keywordInsights: Annotation<KeywordInsight[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  approvedKeywords: Annotation<string[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  candidates: Annotation<LeadCandidate[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  companies: Annotation<GraphCompany[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  emailDrafts: Annotation<GraphEmailDraft[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  currentStep: Annotation<LeadGenerationNode | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined
  }),
  progress: Annotation<Record<LeadGenerationNode, GraphStepStatus>>({
    reducer: (_current, next) => next,
    default: () => initialProgress()
  }),
  errors: Annotation<string[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  logs: Annotation<GraphLog[]>({
    reducer: (_current, next) => next,
    default: () => []
  })
});

export type LeadGenerationGraphState = typeof LeadGenerationAnnotation.State;

export function createInitialLeadGenerationState(input: {
  runId: string;
  productInput: string;
  targetCount: number;
}): LeadGenerationState {
  return {
    runId: input.runId,
    productInput: input.productInput,
    targetCount: input.targetCount,
    keywords: [],
    keywordInsights: [],
    approvedKeywords: [],
    candidates: [],
    companies: [],
    emailDrafts: [],
    progress: initialProgress(),
    errors: [],
    logs: []
  };
}

export function initialProgress(): Record<LeadGenerationNode, GraphStepStatus> {
  return Object.fromEntries(leadGenerationNodes.map((node) => [node, "pending"])) as Record<
    LeadGenerationNode,
    GraphStepStatus
  >;
}

export function completeNode(
  state: LeadGenerationGraphState,
  step: LeadGenerationNode,
  message: string
) {
  const now = new Date().toISOString();

  return {
    currentStep: step,
    progress: {
      ...state.progress,
      [step]: "completed" as const
    },
    logs: [
      ...state.logs,
      {
        step,
        status: "running" as const,
        message: `${leadGenerationNodeLabels[step]} started.`,
        timestamp: now
      },
      {
        step,
        status: "completed" as const,
        message,
        timestamp: new Date().toISOString()
      }
    ]
  };
}

export function waitForReviewNode(
  state: LeadGenerationGraphState,
  step: LeadGenerationNode,
  message: string
) {
  const now = new Date().toISOString();

  return {
    currentStep: step,
    progress: {
      ...state.progress,
      [step]: "waiting_review" as const
    },
    logs: [
      ...state.logs,
      {
        step,
        status: "waiting_review" as const,
        message,
        timestamp: now
      }
    ]
  };
}

export function failNode(state: LeadGenerationGraphState, step: LeadGenerationNode, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown graph node error.";
  const now = new Date().toISOString();

  return {
    currentStep: step,
    progress: {
      ...state.progress,
      [step]: "failed" as const
    },
    errors: [...state.errors, message],
    logs: [
      ...state.logs,
      {
        step,
        status: "failed" as const,
        message,
        timestamp: now
      }
    ]
  };
}
