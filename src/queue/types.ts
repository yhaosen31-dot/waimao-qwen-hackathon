export type LeadJobType =
  | "excel_enrichment"
  | "product_search"
  | "buyer_fit_scoring"
  | "email_draft_generation"
  | "full_excel_flow"
  | "full_product_search_flow";

export interface LeadJobPayload {
  type: LeadJobType;
  runId: string;
  organizationId?: string;
  importJobId?: string;
  source: "excel_import" | "product_search";
  options?: Record<string, unknown>;
}

export type AddLeadJobInput = LeadJobPayload;

export interface AddLeadJobResult {
  queued: boolean;
  jobId?: string;
  mode: "queue" | "sync";
  reason?: string;
}
