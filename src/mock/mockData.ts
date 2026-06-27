import type {
  Company,
  CreateRunInput,
  EmailDraft,
  Keyword,
  LeadGenerationStepKey,
  SaveCompanyInput,
  SaveEmailDraftInput
} from "@/types";

export const leadGenerationStepLabels: Record<LeadGenerationStepKey, string> = {
  normalizeInput: "Normalize input",
  generateKeywords: "Generate keywords",
  searchCrossBorderImporters: "Search cross-border importers",
  extractCompanyDetails: "Extract company details",
  discoverWebsite: "Discover website",
  searchEmailsByDomain: "Search emails by domain",
  discoverWhatsappAndContacts: "Discover WhatsApp and contacts",
  scoreBuyerFit: "Score Buyer Fit",
  generateEmailDraft: "Generate email draft",
  saveToCrm: "Save to CRM",
  humanApproveKeywords: "Human approve keywords",
  humanApproveEmail: "Human approve email",
  saveEmailDraft: "Save email draft"
};

export const leadGenerationStepOrder: LeadGenerationStepKey[] = [
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

export const mockRunInput: CreateRunInput = {
  productInput: "diaphragm accumulator",
  normalizedProduct: "diaphragm accumulator",
  targetCustomerCount: 20,
  metadata: {
    mode: "mock",
    externalApiCalls: 0
  }
};

export const mockKeywords: Array<Omit<Keyword, "id" | "runId" | "createdAt" | "updatedAt">> = [
  {
    value: "diaphragm accumulator",
    language: "en",
    source: "mock",
    status: "pending",
    confidence: 0.96,
    evidenceIds: []
  },
  {
    value: "hydraulic accumulator importer",
    language: "en",
    source: "mock",
    status: "pending",
    confidence: 0.91,
    evidenceIds: []
  },
  {
    value: "industrial hydraulic accumulator supplier",
    language: "en",
    source: "mock",
    status: "pending",
    confidence: 0.88,
    evidenceIds: []
  }
];

export const mockCompanies: SaveCompanyInput[] = [
  {
    name: "Atlas Hydraulic Imports LLC",
    country: "United States",
    city: "Houston",
    website: "https://www.atlashydraulicimports.com",
    domain: "atlashydraulicimports.com",
    industry: "Industrial hydraulics",
    products: ["diaphragm accumulators", "hydraulic valves", "seal kits"],
    importerProfile: "Distributor serving oilfield and industrial hydraulic repair buyers.",
    buyerFitScore: 94,
    buyerFitReasons: [
      "Strong product overlap",
      "Hydraulic replacement-parts distributor",
      "Clear procurement email pattern"
    ],
    source: "mock",
    evidenceIds: []
  },
  {
    name: "Nordic Fluid Power AB",
    country: "Sweden",
    city: "Gothenburg",
    website: "https://www.nordicfluidpower.com",
    domain: "nordicfluidpower.com",
    industry: "Fluid power distribution",
    products: ["diaphragm accumulators", "hose assemblies", "pressure gauges"],
    importerProfile: "Fluid power reseller focused on marine and mobile machinery service.",
    buyerFitScore: 89,
    buyerFitReasons: ["Fluid power catalog match", "Distributor profile", "Relevant machinery segment"],
    source: "mock",
    evidenceIds: []
  }
];

export function createMockEmailDrafts(companies: Company[]): SaveEmailDraftInput[] {
  return companies.map((company) => ({
    companyId: company.id,
    subject: `Diaphragm accumulator supply for ${company.name}`,
    body: [
      "Hi Procurement Team,",
      "",
      `I noticed ${company.name} works with ${company.products.join(", ")}.`,
      "We manufacture diaphragm accumulators and related hydraulic accumulator parts for importers and distributors.",
      "",
      "Could I send a short catalog and learn which pressure range you usually purchase?",
      "",
      "Best regards,"
    ].join("\n"),
    status: "draft",
    provider: "mock",
    personalizationNotes: company.buyerFitReasons,
    evidenceIds: company.evidenceIds
  }));
}

export const mockEmailDrafts: Array<Omit<EmailDraft, "id" | "runId" | "createdAt" | "updatedAt">> =
  mockCompanies.map((company, index) => ({
    companyId: company.id ?? `mock_company_${index + 1}`,
    subject: `Diaphragm accumulator supply for ${company.name}`,
    body: `Hi Procurement Team,\n\nWe manufacture diaphragm accumulators for distributors like ${company.name}.\n\nBest regards,`,
    status: "draft",
    provider: "mock",
    personalizationNotes: company.buyerFitReasons,
    evidenceIds: []
  }));
