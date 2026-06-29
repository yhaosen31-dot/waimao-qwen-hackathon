export type EntityId = string;
export type IsoDateTime = string;

export type RunStatus =
  | "created"
  | "queued"
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
  | "imported_candidate"
  | "product_search_candidate"
  | "enriched"
  | "scored"
  | "drafted"
  | "email_approved"
  | "email_skipped"
  | "contacted"
  | "replied"
  | "invalid"
  | "blacklist"
  | "saved_to_crm";
export type ImportJobStatus = "uploaded" | "parsed" | "mapped" | "imported" | "failed";
export type ImportRowStatus =
  | "parsed"
  | "ready"
  | "duplicate"
  | "needs_review"
  | "missing_company"
  | "imported"
  | "failed";
export type CompanyEnrichmentStatus = "pending" | "running" | "completed" | "failed" | "needs_review";
export type WebsiteStatus = "not_started" | "found" | "not_found" | "needs_review";
export type ContactStatus = "not_started" | "found" | "not_found" | "partial" | "needs_review";
export type BuyerFitTier = "high" | "medium" | "low" | "unknown";
export type CompanyRole =
  | "importer"
  | "distributor"
  | "trading_company"
  | "manufacturer"
  | "end_user"
  | "unknown";
export type SuggestedAction = "email_first" | "whatsapp_first" | "manual_review" | "skip";
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
  | "excel_import"
  | "product_search"
  | "cross_border_search"
  | "website_search"
  | "foreign_trade_email"
  | "exa"
  | "tavily"
  | "you"
  | "minimax"
  | "manual";
export type SearchProviderName = "exa" | "tavily" | "you" | "mock";
export type SearchMode = "economy" | "fallback" | "deep_verify";
export type SearchQueryType = "website" | "email" | "phone" | "whatsapp" | "social" | "contact";
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
  | "searchCustomersByProduct"
  | "extractCompanyDetails"
  | "enrichCompanies"
  | "discoverWebsite"
  | "discoverContacts"
  | "mergeEvidence"
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
  normalizedName?: string;
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
  buyerFitTier?: BuyerFitTier;
  companyRole?: CompanyRole;
  buyerFitReasons: string[];
  buyerFitRisks?: string[];
  leadScore?: number;
  confidence?: number;
  suggestedAction?: SuggestedAction;
  sourceKeyword?: string;
  sourceQuery?: string;
  sourceProvider?: SearchProviderName;
  productDescription?: string;
  transactionSummary?: string;
  importJobId?: EntityId;
  enrichmentStatus?: CompanyEnrichmentStatus;
  websiteStatus?: WebsiteStatus;
  contactStatus?: ContactStatus;
  contactConfidence?: number;
  primaryWebsite?: string;
  recommendedEmails?: string[];
  recommendedPhone?: string;
  recommendedWhatsapp?: string;
  recommendedSocialLinks?: {
    linkedin?: string;
    facebook?: string;
  };
  evidenceSummary?: string;
  enrichmentLogs?: Array<{
    step: string;
    status: "completed" | "failed" | "needs_review" | "not_found";
    message: string;
    timestamp: IsoDateTime;
  }>;
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

export interface PhoneNumber extends TimestampedRecord {
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
  sourceProvider?: SearchProviderName;
  type:
    | "search_result"
    | "website"
    | "directory"
    | "email_pattern"
    | "manual_note"
    | "excel_import"
    | "website_not_found"
    | "email_search"
    | "phone_search"
    | "whatsapp_search"
    | "social_search"
    | "buyer_fit"
    | "email_draft"
    | "mock"
    | "product_search"
    | "website_search"
    | "contact_search"
    | "email_draft";
  source?: string;
  title?: string;
  url?: string;
  snippet?: string;
  rawText?: string;
  confidence?: number;
  raw?: unknown;
  rawJson?: unknown;
}

export interface ImportJob extends TimestampedRecord {
  fileName: string;
  filePath: string;
  status: ImportJobStatus;
  totalRows: number;
  parsedRows: number;
  companyCount: number;
  dedupedCompanyCount: number;
  missingCompanyNameCount: number;
  errorMessage?: string;
  runId?: EntityId;
}

export interface ImportRow extends TimestampedRecord {
  importJobId: EntityId;
  rowIndex: number;
  rawData: Record<string, string>;
  companyName?: string;
  normalizedCompanyName?: string;
  country?: string;
  productDescription?: string;
  transactionSummary?: string;
  sourceKeyword?: string;
  status: ImportRowStatus;
}

export interface ColumnMapping {
  importJobId: EntityId;
  companyNameColumn?: string;
  countryColumn?: string;
  productDescriptionColumn?: string;
  transactionSummaryColumn?: string;
  sourceKeywordColumn?: string;
}

export interface SearchQueryLog extends TimestampedRecord {
  companyId?: EntityId;
  importJobId?: EntityId;
  query: string;
  searchType: SearchQueryType;
  mode: SearchMode;
  provider?: SearchProviderName;
  status: "success" | "failed" | "fallback" | "skipped";
  resultCount: number;
  averageConfidence?: number;
  fallbackReason?: string;
  errorMessage?: string;
}

export interface SearchProviderUsage extends TimestampedRecord {
  provider: SearchProviderName;
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  fallbackCount: number;
  lastUsedAt?: IsoDateTime;
  lastError?: string;
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
  usedEvidenceIds?: EntityId[];
  styleNotes?: string[];
  approvedAt?: IsoDateTime;
  skippedAt?: IsoDateTime;
  sentAt?: IsoDateTime;
  editedAt?: IsoDateTime;
  errorMessage?: string;
  provider: "mock" | "resend" | "smtp";
  personalizationNotes: string[];
  evidenceIds: EntityId[];
}

export interface CompanyNote extends TimestampedRecord {
  companyId: EntityId;
  content: string;
}

export interface EmailLog extends TimestampedRecord {
  runId: EntityId;
  emailDraftId: EntityId;
  companyId: EntityId;
  provider: "mock" | "resend" | "smtp";
  action: "save_draft" | "send";
  status: "mock_sent" | "sent" | "failed" | "success" | "skipped";
  toEmail?: string;
  fromEmail?: string;
  subject?: string;
  providerMessageId?: string;
  errorMessage?: string;
  attemptedAt: IsoDateTime;
}

export interface AuditLog extends TimestampedRecord {
  organizationId?: EntityId;
  actorType: "anonymous" | "user" | "system" | "worker";
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  status: "success" | "failure" | "blocked";
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

export interface LocalJsonDatabase {
  schemaVersion: 1;
  runs: Run[];
  runSteps: RunStep[];
  keywords: Keyword[];
  importJobs: ImportJob[];
  importRows: ImportRow[];
  columnMappings: ColumnMapping[];
  searchQueryLogs: SearchQueryLog[];
  searchProviderUsage: SearchProviderUsage[];
  companies: Company[];
  contacts: Contact[];
  emailAddresses: EmailAddress[];
  whatsappNumbers: WhatsappNumber[];
  phoneNumbers: PhoneNumber[];
  evidence: Evidence[];
  emailDrafts: EmailDraft[];
  companyNotes: CompanyNote[];
  emailLogs: EmailLog[];
  auditLogs: AuditLog[];
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
  phoneNumbers: PhoneNumber[];
  evidence: Evidence[];
  emailDrafts: EmailDraft[];
  emailLogs: EmailLog[];
  auditLogs?: AuditLog[];
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

export type SavePhoneNumberInput = Omit<PhoneNumber, "id" | "runId" | "createdAt" | "updatedAt"> &
  Partial<Pick<PhoneNumber, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveEvidenceInput = Omit<Evidence, "id" | "runId" | "createdAt" | "updatedAt"> &
  Partial<Pick<Evidence, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveCompanyNoteInput = Omit<CompanyNote, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<CompanyNote, "id" | "createdAt" | "updatedAt">>;

export type CreateImportJobInput = Omit<ImportJob, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<ImportJob, "id" | "createdAt" | "updatedAt">>;

export type SaveImportRowInput = Omit<ImportRow, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<ImportRow, "id" | "createdAt" | "updatedAt">>;

export type SaveEmailLogInput = Omit<EmailLog, "id" | "runId" | "createdAt" | "updatedAt"> &
  Partial<Pick<EmailLog, "id" | "runId" | "createdAt" | "updatedAt">>;

export type SaveAuditLogInput = Omit<AuditLog, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<AuditLog, "id" | "createdAt" | "updatedAt">>;

export interface CompanyResults {
  company: Company;
  contacts: Contact[];
  emailAddresses: EmailAddress[];
  whatsappNumbers: WhatsappNumber[];
  phoneNumbers: PhoneNumber[];
  evidence: Evidence[];
  emailDrafts: EmailDraft[];
  companyNotes: CompanyNote[];
  emailLogs: EmailLog[];
}
