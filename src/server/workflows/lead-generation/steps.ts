import type { WorkflowStep, WorkflowStepKey, WorkflowStepStatus } from "@/lib/types";

export const workflowStepLabels: Record<WorkflowStepKey, string> = {
  normalize_input: "Standardize product input",
  generate_keywords: "Generate English keywords",
  human_confirm_keywords: "Human keyword review",
  search_importers: "KJing-style importer search",
  extract_company_details: "Extract company details and websites",
  resolve_missing_websites: "Resolve missing websites",
  find_emails: "Find emails by domain",
  enrich_contacts: "Search WhatsApp, phone, contacts",
  score_buyer_fit: "Buyer Fit scoring",
  generate_email_drafts: "Generate outreach draft",
  human_confirm_email: "Human email review",
  save_email_drafts: "Save draft only",
  save_to_crm: "Save customer to CRM"
};

export const workflowStepOrder = Object.keys(workflowStepLabels) as WorkflowStepKey[];

export function createInitialSteps(): WorkflowStep[] {
  return workflowStepOrder.map((key) => ({
    key,
    label: workflowStepLabels[key],
    status: "pending",
    summary: "Waiting"
  }));
}

export function updateStep(
  steps: WorkflowStep[],
  key: WorkflowStepKey,
  status: WorkflowStepStatus,
  summary: string
): WorkflowStep[] {
  const now = new Date().toISOString();

  return steps.map((step) => {
    if (step.key !== key) return step;

    return {
      ...step,
      status,
      summary,
      startedAt: step.startedAt ?? now,
      completedAt: status === "completed" || status === "blocked" ? now : step.completedAt
    };
  });
}
