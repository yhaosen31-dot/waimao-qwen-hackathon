export type TaskStatus = "completed" | "awaiting_review";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type WorkflowStepStatus = "pending" | "running" | "completed" | "blocked";

export type WorkflowStepKey =
  | "normalize_input"
  | "generate_keywords"
  | "human_confirm_keywords"
  | "search_importers"
  | "extract_company_details"
  | "resolve_missing_websites"
  | "find_emails"
  | "enrich_contacts"
  | "score_buyer_fit"
  | "generate_email_drafts"
  | "human_confirm_email"
  | "save_email_drafts"
  | "save_to_crm";

export interface WorkflowStep {
  key: WorkflowStepKey;
  label: string;
  status: WorkflowStepStatus;
  summary: string;
  startedAt?: string;
  completedAt?: string;
}

export interface LeadTask {
  id: string;
  productInput: string;
  normalizedProduct: string;
  targetCount: number;
  status: TaskStatus;
  keywordReviewStatus: ReviewStatus;
  emailReviewStatus: ReviewStatus;
  keywords: string[];
  steps: WorkflowStep[];
  customerIds: string[];
  draftIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadEmail {
  address: string;
  source: "domain_pattern" | "mock_export_directory" | "manual";
  confidence: number;
}

export interface CustomerLead {
  id: string;
  taskId: string;
  companyName: string;
  country: string;
  city: string;
  website: string;
  domain: string;
  emails: LeadEmail[];
  whatsapp: string;
  phone: string;
  contactName: string;
  contactTitle: string;
  products: string[];
  importerProfile: string;
  annualImportEstimate: string;
  buyerFitScore: number;
  scoreReasons: string[];
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailDraft {
  id: string;
  taskId: string;
  customerId: string;
  to: string;
  subject: string;
  body: string;
  status: "draft" | "approved" | "sent_mock";
  provider: "mock-resend" | "resend" | "smtp";
  personalizationNotes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LocalDatabase {
  tasks: LeadTask[];
  customers: CustomerLead[];
  drafts: EmailDraft[];
  updatedAt: string;
}

export interface TaskBundle {
  task: LeadTask;
  customers: CustomerLead[];
  drafts: EmailDraft[];
}

export interface WorkflowRunResult {
  task: LeadTask;
  customers: CustomerLead[];
  drafts: EmailDraft[];
}
