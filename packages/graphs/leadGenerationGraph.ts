import {
  Annotation,
  END,
  MemorySaver,
  START,
  StateGraph,
  type BaseCheckpointSaver
} from "@langchain/langgraph";

export type LeadGenerationNodeName =
  | "normalizeInput"
  | "generateKeywords"
  | "humanApproveKeywords"
  | "searchCustomersByProduct"
  | "extractCompanyDetails"
  | "discoverWebsite"
  | "searchEmailsByDomain"
  | "discoverWhatsappAndContacts"
  | "scoreBuyerFit"
  | "generateEmailDraft"
  | "humanApproveEmail"
  | "saveEmailDraft"
  | "saveToCrm";

export type RunStepStatus = "pending" | "running" | "completed" | "paused" | "failed";

export interface RunStep {
  node: LeadGenerationNodeName;
  label: string;
  status: RunStepStatus;
  summary: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ImporterLead {
  id: string;
  companyName: string;
  country: string;
  source: "product-search-seed";
  matchedKeyword: string;
}

export interface CompanyDetails {
  id: string;
  companyName: string;
  country: string;
  website?: string;
  domain?: string;
  profile: string;
  products: string[];
}

export interface EmailCandidate {
  companyId: string;
  email: string;
  confidence: number;
  source: "mock-domain-pattern";
}

export interface ContactDiscovery {
  companyId: string;
  contactName: string;
  title: string;
  whatsapp: string;
  phone: string;
  source: "mock-exa-tavily-you";
}

export interface BuyerFitScore {
  companyId: string;
  score: number;
  reasons: string[];
}

export interface EmailDraft {
  companyId: string;
  to: string;
  subject: string;
  body: string;
  status: "generated" | "approved" | "saved_draft";
  provider: "mock-resend";
}

export interface CrmRecord {
  companyId: string;
  companyName: string;
  stage: "draft_saved";
  score: number;
  owner: "mock-agent";
}

export interface HumanApproval {
  approved: boolean;
  approvedBy?: string;
  notes?: string;
}

export interface LeadGenerationState {
  runId: string;
  productInput: string;
  targetCustomerCount: number;
  normalizedProduct?: string;
  keywords: string[];
  keywordApproval?: HumanApproval;
  importers: ImporterLead[];
  companies: CompanyDetails[];
  emailCandidates: EmailCandidate[];
  contactDiscoveries: ContactDiscovery[];
  buyerFitScores: BuyerFitScore[];
  emailDrafts: EmailDraft[];
  emailApproval?: HumanApproval;
  crmRecords: CrmRecord[];
  run_steps: RunStep[];
}

export const leadGenerationNodeOrder: LeadGenerationNodeName[] = [
  "normalizeInput",
  "generateKeywords",
  "humanApproveKeywords",
  "searchCustomersByProduct",
  "extractCompanyDetails",
  "discoverWebsite",
  "searchEmailsByDomain",
  "discoverWhatsappAndContacts",
  "scoreBuyerFit",
  "generateEmailDraft",
  "humanApproveEmail",
  "saveEmailDraft",
  "saveToCrm"
];

export const humanPauseNodes: LeadGenerationNodeName[] = [
  "humanApproveKeywords",
  "humanApproveEmail"
];

const nodeLabels: Record<LeadGenerationNodeName, string> = {
  normalizeInput: "Normalize product input",
  generateKeywords: "Generate English keywords",
  humanApproveKeywords: "Human approve keywords",
  searchCustomersByProduct: "Search customers by product",
  extractCompanyDetails: "Extract company details",
  discoverWebsite: "Discover website",
  searchEmailsByDomain: "Search emails by domain",
  discoverWhatsappAndContacts: "Discover WhatsApp and contacts",
  scoreBuyerFit: "Score Buyer Fit",
  generateEmailDraft: "Generate email draft",
  humanApproveEmail: "Human approve email",
  saveEmailDraft: "Save email draft",
  saveToCrm: "Save to CRM"
};

const LeadGenerationAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  productInput: Annotation<string>(),
  targetCustomerCount: Annotation<number>(),
  normalizedProduct: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined
  }),
  keywords: Annotation<string[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  keywordApproval: Annotation<HumanApproval | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined
  }),
  importers: Annotation<ImporterLead[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  companies: Annotation<CompanyDetails[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  emailCandidates: Annotation<EmailCandidate[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  contactDiscoveries: Annotation<ContactDiscovery[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  buyerFitScores: Annotation<BuyerFitScore[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  emailDrafts: Annotation<EmailDraft[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  emailApproval: Annotation<HumanApproval | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined
  }),
  crmRecords: Annotation<CrmRecord[]>({
    reducer: (_current, next) => next,
    default: () => []
  }),
  run_steps: Annotation<RunStep[]>({
    reducer: (_current, next) => next,
    default: () => initialRunSteps()
  })
});

type GraphState = typeof LeadGenerationAnnotation.State;

export interface CreateLeadGenerationGraphOptions {
  /**
   * Enables LangGraph-native pause points after human approval nodes.
   * Provide a thread_id when invoking if you want to resume from a checkpoint.
   */
  pauseOnHumanApproval?: boolean;
  checkpointer?: BaseCheckpointSaver;
}

export function createLeadGenerationGraph(options: CreateLeadGenerationGraphOptions = {}) {
  const pauseOnHumanApproval = options.pauseOnHumanApproval ?? false;
  const checkpointer = options.checkpointer ?? (pauseOnHumanApproval ? new MemorySaver() : undefined);

  return new StateGraph(LeadGenerationAnnotation)
    .addNode("normalizeInput", normalizeInput)
    .addNode("generateKeywords", generateKeywords)
    .addNode("humanApproveKeywords", humanApproveKeywords)
    .addNode("searchCustomersByProduct", searchCustomersByProduct)
    .addNode("extractCompanyDetails", extractCompanyDetails)
    .addNode("discoverWebsite", discoverWebsite)
    .addNode("searchEmailsByDomain", searchEmailsByDomain)
    .addNode("discoverWhatsappAndContacts", discoverWhatsappAndContacts)
    .addNode("scoreBuyerFit", scoreBuyerFit)
    .addNode("generateEmailDraft", generateEmailDraft)
    .addNode("humanApproveEmail", humanApproveEmail)
    .addNode("saveEmailDraft", saveEmailDraft)
    .addNode("saveToCrm", saveToCrm)
    .addEdge(START, "normalizeInput")
    .addEdge("normalizeInput", "generateKeywords")
    .addEdge("generateKeywords", "humanApproveKeywords")
    .addEdge("humanApproveKeywords", "searchCustomersByProduct")
    .addEdge("searchCustomersByProduct", "extractCompanyDetails")
    .addEdge("extractCompanyDetails", "discoverWebsite")
    .addEdge("discoverWebsite", "searchEmailsByDomain")
    .addEdge("searchEmailsByDomain", "discoverWhatsappAndContacts")
    .addEdge("discoverWhatsappAndContacts", "scoreBuyerFit")
    .addEdge("scoreBuyerFit", "generateEmailDraft")
    .addEdge("generateEmailDraft", "humanApproveEmail")
    .addEdge("humanApproveEmail", "saveEmailDraft")
    .addEdge("saveEmailDraft", "saveToCrm")
    .addEdge("saveToCrm", END)
    .compile({
      checkpointer,
      interruptAfter: pauseOnHumanApproval ? humanPauseNodes : undefined,
      name: "leadGenerationGraph"
    });
}

export function initialLeadGenerationState(input: {
  runId: string;
  productInput: string;
  targetCustomerCount: number;
}): LeadGenerationState {
  return {
    runId: input.runId,
    productInput: input.productInput,
    targetCustomerCount: input.targetCustomerCount,
    keywords: [],
    importers: [],
    companies: [],
    emailCandidates: [],
    contactDiscoveries: [],
    buyerFitScores: [],
    emailDrafts: [],
    crmRecords: [],
    run_steps: initialRunSteps()
  };
}

export async function runMockLeadGeneration(input: {
  runId: string;
  productInput: string;
  targetCustomerCount: number;
}) {
  const graph = createLeadGenerationGraph();
  return graph.invoke(initialLeadGenerationState(input));
}

async function normalizeInput(state: GraphState) {
  const normalizedProduct = state.productInput.trim().replace(/\s+/g, " ").toLowerCase();

  return {
    normalizedProduct,
    run_steps: completeStep(
      state.run_steps,
      "normalizeInput",
      `Normalized "${state.productInput}" to "${normalizedProduct}".`
    )
  };
}

async function generateKeywords(state: GraphState) {
  const product = state.normalizedProduct ?? state.productInput;
  const keywords = [
    product,
    "hydraulic accumulator",
    "diaphragm accumulator supplier",
    "hydraulic accumulator distributor",
    "industrial hydraulic accumulator",
    "pressure accumulator for hydraulic system",
    "nitrogen charged diaphragm accumulator",
    "hydraulic spare parts distributor"
  ];

  return {
    keywords,
    run_steps: completeStep(state.run_steps, "generateKeywords", `Generated ${keywords.length} mock keywords.`)
  };
}

async function humanApproveKeywords(state: GraphState) {
  const keywordApproval = state.keywordApproval ?? {
    approved: true,
    approvedBy: "mock-human-reviewer",
    notes: "Mock approval. Replace with UI resume payload later."
  };

  return {
    keywordApproval,
    run_steps: completeStep(
      state.run_steps,
      "humanApproveKeywords",
      keywordApproval.approved ? "Keywords approved by mock reviewer." : "Keyword approval rejected."
    )
  };
}

async function searchCustomersByProduct(state: GraphState) {
  const importers = Array.from({ length: state.targetCustomerCount }, (_, index) => ({
    id: `importer_${index + 1}`,
    companyName: mockCompanyName(index),
    country: mockCountry(index),
    source: "product-search-seed" as const,
    matchedKeyword: state.keywords[index % Math.max(state.keywords.length, 1)] ?? "hydraulic accumulator distributor"
  }));

  return {
    importers,
    run_steps: completeStep(
      state.run_steps,
      "searchCustomersByProduct",
      `Found ${importers.length} product-search seed candidates. No cross-search automation was used.`
    )
  };
}

async function extractCompanyDetails(state: GraphState) {
  const companies = state.importers.map((importer, index) => ({
    id: importer.id,
    companyName: importer.companyName,
    country: importer.country,
    website: index % 3 === 0 ? undefined : `https://www.${mockDomain(importer.companyName)}`,
    domain: index % 3 === 0 ? undefined : mockDomain(importer.companyName),
    profile: "Mock importer/distributor profile for industrial hydraulic spare parts.",
    products: ["diaphragm accumulator", "hydraulic accumulator", "hydraulic spare parts"]
  }));

  return {
    companies,
    run_steps: completeStep(
      state.run_steps,
      "extractCompanyDetails",
      `Extracted details for ${companies.length} mock companies.`
    )
  };
}

async function discoverWebsite(state: GraphState) {
  const companies = state.companies.map((company) => {
    if (company.website && company.domain) return company;

    const domain = mockDomain(company.companyName);

    return {
      ...company,
      website: `https://www.${domain}`,
      domain
    };
  });

  return {
    companies,
    run_steps: completeStep(
      state.run_steps,
      "discoverWebsite",
      "Completed mock website discovery. No real search API was called."
    )
  };
}

async function searchEmailsByDomain(state: GraphState) {
  const emailCandidates = state.companies.flatMap((company) => {
    const domain = company.domain ?? mockDomain(company.companyName);

    return [
      {
        companyId: company.id,
        email: `procurement@${domain}`,
        confidence: 0.91,
        source: "mock-domain-pattern" as const
      },
      {
        companyId: company.id,
        email: `sales@${domain}`,
        confidence: 0.76,
        source: "mock-domain-pattern" as const
      }
    ];
  });

  return {
    emailCandidates,
    run_steps: completeStep(
      state.run_steps,
      "searchEmailsByDomain",
      `Generated ${emailCandidates.length} mock email patterns. No external email lookup was used.`
    )
  };
}

async function discoverWhatsappAndContacts(state: GraphState) {
  const contactDiscoveries = state.companies.map((company, index) => ({
    companyId: company.id,
    contactName: mockContactName(index),
    title: index % 2 === 0 ? "Procurement Manager" : "Import Manager",
    whatsapp: `+1${String(7000000000 + index * 11357)}`,
    phone: `+1 ${String(7000000000 + index * 11357)}`,
    source: "mock-exa-tavily-you" as const
  }));

  return {
    contactDiscoveries,
    run_steps: completeStep(
      state.run_steps,
      "discoverWhatsappAndContacts",
      `Generated ${contactDiscoveries.length} mock contact records. No EXA/Tavily/YOU call was made.`
    )
  };
}

async function scoreBuyerFit(state: GraphState) {
  const buyerFitScores = state.companies.map((company, index) => ({
    companyId: company.id,
    score: Math.min(96, 72 + (index % 6) * 4),
    reasons: [
      "Product catalog overlaps with diaphragm accumulator demand.",
      "Profile suggests recurring industrial replacement-parts purchasing.",
      "Mock market signal indicates importer/distributor fit."
    ]
  }));

  return {
    buyerFitScores,
    run_steps: completeStep(state.run_steps, "scoreBuyerFit", `Scored ${buyerFitScores.length} mock buyers.`)
  };
}

async function generateEmailDraft(state: GraphState) {
  const emailDrafts = state.companies.map((company) => {
    const email = state.emailCandidates.find((candidate) => candidate.companyId === company.id);

    return {
      companyId: company.id,
      to: email?.email ?? `procurement@${company.domain ?? mockDomain(company.companyName)}`,
      subject: `Diaphragm accumulator supply for ${company.companyName}`,
      body: [
        `Hi ${state.contactDiscoveries.find((contact) => contact.companyId === company.id)?.contactName ?? "there"},`,
        "",
        `I noticed ${company.companyName} works with hydraulic spare parts and industrial replacement supply.`,
        `We manufacture ${state.normalizedProduct ?? state.productInput} and related accumulator components for importers and distributors.`,
        "",
        "Could I send a short catalog and learn which pressure range and volume you usually purchase?",
        "",
        "Best regards,"
      ].join("\n"),
      status: "generated" as const,
      provider: "mock-resend" as const
    };
  });

  return {
    emailDrafts,
    run_steps: completeStep(
      state.run_steps,
      "generateEmailDraft",
      `Generated ${emailDrafts.length} mock email drafts.`
    )
  };
}

async function humanApproveEmail(state: GraphState) {
  const emailApproval = state.emailApproval ?? {
    approved: true,
    approvedBy: "mock-human-reviewer",
    notes: "Mock approval. Replace with UI resume payload later."
  };

  return {
    emailApproval,
    emailDrafts: state.emailDrafts.map((draft) => ({
      ...draft,
      status: emailApproval.approved ? ("approved" as const) : draft.status
    })),
    run_steps: completeStep(
      state.run_steps,
      "humanApproveEmail",
      emailApproval.approved ? "Email drafts approved by mock reviewer." : "Email approval rejected."
    )
  };
}

async function saveEmailDraft(state: GraphState) {
  const emailDrafts = state.emailDrafts.map((draft) => ({
    ...draft,
    status: "saved_draft" as const
  }));

  return {
    emailDrafts,
    run_steps: completeStep(
      state.run_steps,
      "saveEmailDraft",
      "Saved mock drafts only. No Resend or SMTP send was performed."
    )
  };
}

async function saveToCrm(state: GraphState) {
  const crmRecords = state.companies.map((company) => ({
    companyId: company.id,
    companyName: company.companyName,
    stage: "draft_saved" as const,
    score: state.buyerFitScores.find((score) => score.companyId === company.id)?.score ?? 0,
    owner: "mock-agent" as const
  }));

  return {
    crmRecords,
    run_steps: completeStep(state.run_steps, "saveToCrm", `Saved ${crmRecords.length} mock CRM records.`)
  };
}

function initialRunSteps(): RunStep[] {
  return leadGenerationNodeOrder.map((node) => ({
    node,
    label: nodeLabels[node],
    status: "pending",
    summary: "Waiting"
  }));
}

function completeStep(runSteps: RunStep[], node: LeadGenerationNodeName, summary: string): RunStep[] {
  const now = new Date().toISOString();
  const steps = runSteps.length > 0 ? runSteps : initialRunSteps();

  return steps.map((step) =>
    step.node === node
      ? {
          ...step,
          status: "completed",
          summary,
          startedAt: step.startedAt ?? now,
          completedAt: now
        }
      : step
  );
}

function mockCompanyName(index: number) {
  const names = [
    "Atlas Hydraulic Imports LLC",
    "Nordic Fluid Power AB",
    "Mendoza Industrial Supply",
    "BluePort Engineering Pte Ltd",
    "Rheinland Motion Components GmbH",
    "Cedar Rail Maintenance Ltd",
    "Santos Agro Machinery SA",
    "Pacific Lift Systems Pty Ltd",
    "Al Noor Oilfield Supplies",
    "Iberia Fluid Technik SL"
  ];

  return names[index % names.length];
}

function mockCountry(index: number) {
  const countries = [
    "United States",
    "Sweden",
    "Mexico",
    "Singapore",
    "Germany",
    "United Kingdom",
    "Brazil",
    "Australia",
    "United Arab Emirates",
    "Spain"
  ];

  return countries[index % countries.length];
}

function mockContactName(index: number) {
  const contacts = [
    "Daniel Brooks",
    "Maja Lindstrom",
    "Carlos Rivera",
    "Priya Menon",
    "Thomas Weber",
    "Hannah Clarke",
    "Renata Costa",
    "Oliver Wright",
    "Noura Haddad",
    "Luis Ortega"
  ];

  return contacts[index % contacts.length];
}

function mockDomain(companyName: string) {
  return `${companyName
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 28)}.com`;
}
