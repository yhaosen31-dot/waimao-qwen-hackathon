import { runLeadGenerationGraphFromState } from "@/graphs/leadGenerationGraph";
import { persistGraphRunState } from "@/graphs/persistGraphRunState";
import { addLeadJob } from "@/queue/leadQueue";
import { createInitialLeadGenerationState, type SearchProviderPreference } from "@/graphs/state";
import {
  getRunResults,
  readStore,
  saveKeywords,
  updateCompany,
  updateEmailDraft,
  updateRun,
  updateRunStep
} from "@/repositories/store";
import type { EmailDraft, EmailDraftStatus, EntityId, RunResults, SearchMode } from "@/types";

export interface EmailDraftDecisionInput {
  draftId: EntityId;
  subject?: string;
  body?: string;
  action: "approve" | "skip" | "save_draft";
}

export async function approveKeywordsForRun(runId: EntityId, keywordIds: EntityId[]) {
  const results = await getRunResults(runId);

  if (!results) throw new Error("Run not found");

  const selectedIds = new Set(keywordIds);
  const approvedKeywords = results.keywords
    .filter((keyword) => selectedIds.has(keyword.id))
    .map((keyword) => keyword.value);

  if (approvedKeywords.length === 0) {
    throw new Error("Select at least one keyword");
  }

  await saveKeywords(
    runId,
    results.keywords.map((keyword) => ({
      ...keyword,
      status: selectedIds.has(keyword.id) ? ("approved" as const) : ("rejected" as const)
    }))
  );
  await updateRunStep(runId, "humanApproveKeywords", {
    status: "completed",
    summary: `Approved ${approvedKeywords.length} keywords. Product search is running in the background.`,
    completedAt: new Date().toISOString()
  });
  await updateRunStep(runId, "searchCustomersByProduct", {
    status: "running",
    summary: "Running MiniMax tool-use product search through SearchProviderRouter.",
    startedAt: new Date().toISOString()
  });
  await updateRun(runId, {
    keywordReviewStatus: "approved",
    status: "running",
    currentStep: "searchCustomersByProduct"
  });

  const queueResult = await addLeadJob({
    type: "product_search",
    runId,
    source: "product_search",
    options: {
      phase: "after_keyword_approval",
      approvedKeywords,
      productInput: results.run.productInput,
      targetCount: results.run.targetCustomerCount,
      targetCountries: metadataStringArray(results.run.metadata?.targetCountries),
      excludedCountries: metadataStringArray(results.run.metadata?.excludedCountries),
      searchMode: metadataSearchMode(results.run.metadata?.searchMode),
      providerPriority: metadataProviderPriority(results.run.metadata?.providerPriority)
    }
  });

  if (!queueResult.queued) {
    void continueRunAfterKeywordApproval(runId, approvedKeywords);
  }

  return getRunResults(runId);
}

async function continueRunAfterKeywordApproval(runId: EntityId, approvedKeywords: string[]) {
  try {
    const results = await getRunResults(runId);
    if (!results) throw new Error("Run not found");

    const graphState = await runLeadGenerationGraphFromState({
      ...createInitialLeadGenerationState({
        runId,
        productInput: results.run.productInput,
        targetCount: results.run.targetCustomerCount,
        targetCountries: metadataStringArray(results.run.metadata?.targetCountries),
        excludedCountries: metadataStringArray(results.run.metadata?.excludedCountries),
        searchMode: metadataSearchMode(results.run.metadata?.searchMode),
        providerPriority: metadataProviderPriority(results.run.metadata?.providerPriority)
      }),
      normalizedProduct: results.run.normalizedProduct,
      keywords: results.keywords.map((keyword) => keyword.value),
      keywordInsights: results.keywords.map((keyword) => ({
        value: keyword.value,
        score: keyword.confidence ?? 0.9,
        reason: keyword.reason ?? "MiniMax keyword generated for importer discovery."
      })),
      approvedKeywords
    });

    await persistGraphRunState(graphState, {
      runStatus: "waiting_review"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown background lead generation error.";
    await updateRunStep(runId, "searchCustomersByProduct", {
      status: "failed",
      summary: message,
      completedAt: new Date().toISOString()
    });
    await updateRun(runId, {
      status: "failed",
      currentStep: "searchCustomersByProduct",
      metadata: {
        backgroundError: message
      }
    });
  }
}

export async function applyEmailDraftDecision(input: EmailDraftDecisionInput) {
  const draft = await updateDraftForDecision(input);
  await syncCompanyStatusFromDraft(draft);
  return finalizeRunIfAllEmailReviewed(draft.runId);
}

export async function applyEmailDraftDecisions(
  runId: EntityId,
  decisions: EmailDraftDecisionInput[]
) {
  const results = await getRunResults(runId);

  if (!results) throw new Error("Run not found");

  for (const decision of decisions) {
    const draft = await updateDraftForDecision(decision);
    await syncCompanyStatusFromDraft(draft);
  }

  return finalizeRunIfAllEmailReviewed(runId);
}

export async function finalizeRunIfAllEmailReviewed(runId: EntityId): Promise<RunResults | null> {
  const results = await getRunResults(runId);

  if (!results) throw new Error("Run not found");

  const allReviewed =
    results.emailDrafts.length > 0 &&
    results.emailDrafts.every((draft) => draft.status === "approved" || draft.status === "skipped");

  if (!allReviewed) {
    await updateRun(runId, {
      status: "waiting_review",
      currentStep: "humanApproveEmail",
      emailReviewStatus: "pending"
    });
    return getRunResults(runId);
  }

  const approvedCount = results.emailDrafts.filter((draft) => draft.status === "approved").length;
  const skippedCount = results.emailDrafts.filter((draft) => draft.status === "skipped").length;

  await updateRunStep(runId, "humanApproveEmail", {
    status: "completed",
    summary: `Reviewed ${results.emailDrafts.length} drafts: ${approvedCount} approved, ${skippedCount} skipped.`
  });
  await updateRunStep(runId, "saveToCrm", {
    status: "completed",
    summary: `Saved ${results.companies.length} companies and ${results.emailDrafts.length} reviewed drafts to local CRM.`
  });
  await updateRun(runId, {
    status: "completed",
    currentStep: "saveToCrm",
    emailReviewStatus: "approved"
  });

  return getRunResults(runId);
}

async function updateDraftForDecision(input: EmailDraftDecisionInput) {
  const results = await findDraftRunResults(input.draftId);
  const draft = results.emailDrafts.find((item) => item.id === input.draftId);

  if (!draft) throw new Error("Email draft not found");
  if (draft.status === "sent") {
    throw new Error("Sent email drafts cannot be changed.");
  }

  const now = new Date().toISOString();
  const subject = input.subject ?? draft.subject;
  const body = input.body ?? draft.body;
  const wasEdited = subject !== draft.subject || body !== draft.body;
  const status = statusForDecision(input.action);

  return updateEmailDraft(input.draftId, {
    subject,
    body,
    status,
    toEmail: draft.toEmail ?? resolveDraftEmail(results, draft),
    approvedAt: status === "approved" ? now : draft.approvedAt,
    skippedAt: status === "skipped" ? now : draft.skippedAt,
    editedAt: wasEdited || status === "draft" ? now : draft.editedAt
  });
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function metadataSearchMode(value: unknown): SearchMode {
  const mode = String(value ?? "fallback");
  return mode === "economy" || mode === "fallback" || mode === "deep_verify" ? mode : "fallback";
}

function metadataProviderPriority(value: unknown): SearchProviderPreference[] {
  const providers = metadataStringArray(value).filter(isSearchProviderPreference);
  return providers.length > 0 ? providers : (["exa"] satisfies SearchProviderPreference[]);
}

function isSearchProviderPreference(value: string): value is SearchProviderPreference {
  return value === "exa" || value === "tavily" || value === "you";
}

async function syncCompanyStatusFromDraft(draft: EmailDraft) {
  const status =
    draft.status === "approved"
      ? "email_approved"
      : draft.status === "skipped"
        ? "email_skipped"
        : "drafted";

  return updateCompany(draft.companyId, {
    status
  });
}

async function findDraftRunResults(draftId: EntityId) {
  const db = await readStore();
  const draft = db.emailDrafts.find((item) => item.id === draftId);

  if (!draft) throw new Error("Email draft not found");

  const result = await getRunResults(draft.runId);

  if (!result) throw new Error("Email draft not found");
  return result;
}

function statusForDecision(action: EmailDraftDecisionInput["action"]): EmailDraftStatus {
  if (action === "approve") return "approved";
  if (action === "skip") return "skipped";
  return "draft";
}

function resolveDraftEmail(results: RunResults, draft: EmailDraft) {
  return (
    results.emailAddresses.find((email) => email.id === draft.toEmailAddressId)?.email ??
    results.emailAddresses.find((email) => email.companyId === draft.companyId)?.email ??
    "procurement@example.com"
  );
}
