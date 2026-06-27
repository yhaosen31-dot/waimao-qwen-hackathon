export type EntityId = string;
export type IsoDateTime = string;

export type RunStatus =
  | "created"
  | "running"
  | "waiting_review"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
export type RunStepStatus =
  | "pending"
  | "running"
  | "waiting_review"
  | "paused"
  | "completed"
  | "failed"
  | "skipped";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type CompanyStatus =
  | "new"
  | "drafted"
  | "email_approved"
  | "email_skipped"
  | "saved_to_crm";
export type EmailDraftStatus =
  | "draft"
  | "waiting_review"
  | "approved"
  | "skipped"
  | "saved"
  | "sent"
  | "failed";
export type EvidenceProvider =
  | "mock"
  | "cross_border_search"
  | "website_search"
  | "foreign_trade_email"
  | "exa"
  | "tavily"
  | "you"
  | "minimax"
  | "manual";
export type SearchProviderName = "exa" | "tavily" | "you" | "mock";
export type ContactSearchResultType =
  | "website"
  | "email"
  | "phone"
  | "whatsapp"
  | "linkedin"
  | "facebook"
  | "other";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  sourceProvider: SearchProviderName;
  confidence: number;
  raw?: unknown;
}

export interface ContactSearchResult {
  type: ContactSearchResultType;
  value: string;
  sourceUrl?: string;
  sourceProvider: SearchProviderName;
  confidence: number;
  evidenceText: string;
  raw?: unknown;
}

export type LeadGenerationStepKey =
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
  | "saveEmailDraft"
  | "saveToCrm";

export interface TimestampedRecord {
  id: EntityId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Run extends TimestampedRecord {
  productInput: string;
  normalizedProduct?: string;
  targetCustomerCount: number;
  status: RunStatus;
  currentStep?: LeadGenerationStepKey;
  keywordReviewStatus: ReviewStatus;
  emailReviewStatus: ReviewStatus;
  metadata?: Record<string, unknown>;
}

export interface RunStep extends TimestampedRecord {
  runId: EntityId;
  stepKey: LeadGenerationStepKey;
  order: number;
  label: string;
  status: RunStepStatus;
  summary?: string;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
  errorMessage?: string;
  startedAt?: IsoDateTime;
  completedAt?: IsoDateTime;
}

export interface Keyword extends TimestampedRecord {
  runId: EntityId;
  value: string;
  language: "en";
  source: "mock" | "llm" | "manual";
  status: ReviewStatus;
  confidence?: number;
  reason?: string;
  evidenceIds: EntityId[];
}

export interface Company extends TimestampedRecord {
  runId: EntityId;
  name: string;
  legalName?: string;
  country?: string;
  city?: string;
  website?: string;
  domain?: string;
  industry?: string;
  products: string[];
  importerProfile?: string;
  emails?: string[];
  whatsappNumbers?: string[];
  buyerFit?: {
    score: number;
    reasons: string[];
    confidence: number;
  };
  buyerFitScore?: number;
  buyerFitReasons: string[];
  leadScore?: number;
  confidence?: number;
  sourceKeyword?: string;
  status?: CompanyStatus;
  source: EvidenceProvider;
  evidenceIds: EntityId[];
  emailDraftIds?: EntityId[];
}

export interface Contact extends TimestampedRecord {
  runId: EntityId;
  companyId: EntityId;
  fullName: string;
  title?: string;
  department?: string;
  source: EvidenceProvider;
  confidence?: number;
  evidenceIds: EntityId[];
}

export interface EmailAddress extends TimestampedRecord {
  runId: EntityId;
  companyId: EntityId;
  contactId?: EntityId;
  email: string;
  domain: string;
  source: EvidenceProvider;
  confidence?: number;
  verificationStatus: "unverified" | "valid" | "invalid" | "risky";
  evidenceIds: EntityId[];
}

export interface WhatsappNumber extends TimestampedRecord {
  runId: EntityId;
  companyId: EntityId;
  contactId?: EntityId;
  number: string;
  countryCode?: string;
  source: EvidenceProvider;
  confidence?: number;
  evidenceIds: EntityId[];
}

export interface Evidence extends TimestampedRecord {
  runId: EntityId;
  companyId?: EntityId;
  contactId?: EntityId;
  provider: EvidenceProvider;
  type:
    | "search_result"
    | "website"
    | "directory"
    | "email_pattern"
    | "manual_note"
    | "mock"
    | "cross_search_mock"
    | "website_mock"
    | "website_search"
    | "email_mock"
    | "whatsapp_mock"
    | "contact_search"
    | "buyer_fit_mock"
    | "email_draft_mock";
  source?: string;
  title?: string;
  url?: string;
  snippet?: string;
  rawText?: string;
  confidence?: number;
  raw?: unknown;
}

export interface EmailDraft extends TimestampedRecord {
  runId: EntityId;
  companyId: EntityId;
  contactId?: EntityId;
  toEmailAddressId?: EntityId;
  toEmail?: string;
  subject: string;
  body: string;
  status: EmailDraftStatus;
  approvedAt?: IsoDateTime;
  skippedAt?: IsoDateTime;
  editedAt?: IsoDateTime;
  provider: "mock" | "resend" | "smtp";
  personalizationNotes: string[];
  evidenceIds: EntityId[];
}

export interface EmailLog extends TimestampedRecord {
  runId: EntityId;
  emailDraftId: EntityId;
  companyId: EntityId;
  provider: "mock" | "resend" | "smtp";
  action: "save_draft" | "send";
  status: "success" | "failed" | "skipped";
  providerMessageId?: string;
  errorMessage?: string;
  attemptedAt: IsoDateTime;
}

export interface LocalJsonDatabase {
  schemaVersion: 1;
  runs: Run[];
  runSteps: RunStep[];
  keywords: Keyword[];
  companies: Company[];
  contacts: Contact[];
  emailAddresses: EmailAddress[];
  whatsappNumbers: WhatsappNumber[];
  evidence: Evidence[];
  emailDrafts: EmailDraft[];
  emailLogs: EmailLog[];
  updatedAt: IsoDateTime;
}

export interface RunResults {
  run: Run;
  runSteps: RunStep[];
  keywords: Keyword[];
  companies: Company[];
  contacts: Contact[];
  emailAddresses: EmailAddress[];
  whatsappNumbers: WhatsappNumber[];
  evidence: Evidence[];
  emailDrafts: EmailDraft[];
  emailLogs: EmailLog[];
}

export interface CreateRunInput {
  productInput: string;
  targetCustomerCount: number;
  normalizedProduct?: string;
  metadata?: Record<string, unknown>;
}

export type UpdateRunStepInput = Partial<
  Pick<
    RunStep,
    | "status"
    | "summary"
    | "inputSnapshot"
    | "outputSnapshot"
    | "errorMessage"
    | "startedAt"
    | "completedAt"
  >
>;

export type SaveCompanyInput = Omit<Company, "id" | "runId" | "createdAt" | "updatedAt"> &
  Partial<Pick<Company, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveEmailDraftInput = Omit<EmailDraft, "id" | "runId" | "createdAt" | "updatedAt"> &
  Partial<Pick<EmailDraft, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveKeywordInput = Omit<Keyword, "id" | "runId" | "createdAt" | "updatedAt"> &
  Partial<Pick<Keyword, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveContactInput = Omit<Contact, "id" | "runId" | "createdAt" | "updatedAt"> &
  Partial<Pick<Contact, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveEmailAddressInput = Omit<
  EmailAddress,
  "id" | "runId" | "createdAt" | "updatedAt"
> &
  Partial<Pick<EmailAddress, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveWhatsappNumberInput = Omit<
  WhatsappNumber,
  "id" | "runId" | "createdAt" | "updatedAt"
> &
  Partial<Pick<WhatsappNumber, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveEvidenceInput = Omit<Evidence, "id" | "runId" | "createdAt" | "updatedAt"> &
  Partial<Pick<Evidence, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveEmailLogInput = Omit<EmailLog, "id" | "runId" | "createdAt" | "updatedAt"> &
  Partial<Pick<EmailLog, "id" | "runId" | "createdAt" | "updatedAt">>;

export interface CompanyResults {
  company: Company;
  contacts: Contact[];
  emailAddresses: EmailAddress[];
  whatsappNumbers: WhatsappNumber[];
  evidence: Evidence[];
  emailDrafts: EmailDraft[];
  emailLogs: EmailLog[];
}
