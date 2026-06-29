import { createHash } from "node:crypto";
import {
  getEmailDraft,
  getImportJobResults,
  readStore,
  saveEmailDrafts,
  saveEvidence,
  updateCompany,
  updateEmailDraft,
  updateRun,
  updateRunStep
} from "@/repositories/store";
import { minimaxProvider } from "@/providers/minimaxProvider";
import type { Company, EmailAddress, EmailDraft, Evidence, SaveEmailDraftInput } from "@/types";

export interface EmailDraftGenerationStats {
  importJobId: string;
  processed: number;
  generated: number;
  skippedLowOrSkip: number;
  skippedNoEmail: number;
  skippedExisting: number;
  failed: number;
  generatedCompanies: Array<{ id: string; name: string; toEmail: string }>;
  skippedCompanies: Array<{ id: string; name: string; reason: "low_or_skip" | "no_email" | "existing_draft" | "failed" }>;
}

export async function generateImportJobEmailDrafts(
  importJobId: string
): Promise<EmailDraftGenerationStats> {
  const results = await getImportJobResults(importJobId);
  if (!results) throw new Error(`Import job not found: ${importJobId}`);

  const db = await readStore();
  const companies = results.companies.filter((company) => company.source === "excel_import");
  const stats: EmailDraftGenerationStats = {
    importJobId,
    processed: companies.length,
    generated: 0,
    skippedLowOrSkip: 0,
    skippedNoEmail: 0,
    skippedExisting: 0,
    failed: 0,
    generatedCompanies: [],
    skippedCompanies: []
  };
  const runIds = new Set<string>();

  for (const company of companies) {
    runIds.add(company.runId);
    const existingDraft = db.emailDrafts.find(
      (draft) => draft.companyId === company.id && draft.status !== "skipped"
    );
    if (existingDraft) {
      stats.skippedExisting += 1;
      stats.skippedCompanies.push({ id: company.id, name: company.name, reason: "existing_draft" });
      continue;
    }

    if (!isEligibleForEmail(company)) {
      stats.skippedLowOrSkip += 1;
      stats.skippedCompanies.push({ id: company.id, name: company.name, reason: "low_or_skip" });
      await appendCompanyDraftLog(company, "Skipped email draft because Buyer Fit/action is not eligible.");
      continue;
    }

    const companyEmails = db.emailAddresses.filter((email) => email.companyId === company.id);
    const selectedEmail = chooseRecommendedEmail(company, companyEmails);
    if (!selectedEmail) {
      stats.skippedNoEmail += 1;
      stats.skippedCompanies.push({ id: company.id, name: company.name, reason: "no_email" });
      await appendCompanyDraftLog(company, "No email was available, so no draft was generated.");
      continue;
    }

    try {
      const created = await generateDraftForCompany({
        company,
        email: selectedEmail.email,
        emailAddressId: selectedEmail.id,
        evidence: db.evidence.filter((item) => item.companyId === company.id)
      });
      stats.generated += 1;
      stats.generatedCompanies.push({
        id: company.id,
        name: company.name,
        toEmail: created.toEmail ?? selectedEmail.email
      });
    } catch {
      stats.failed += 1;
      stats.skippedCompanies.push({ id: company.id, name: company.name, reason: "failed" });
      await appendCompanyDraftLog(company, "Email draft generation failed.");
    }
  }

  for (const runId of runIds) {
    await updateRunStep(runId, "generateEmailDraft", {
      status: stats.generated > 0 ? "completed" : "skipped",
      summary: `Generated ${stats.generated} email draft(s); skipped ${stats.skippedLowOrSkip + stats.skippedNoEmail + stats.skippedExisting}.`
    });
    await updateRunStep(runId, "humanApproveEmail", {
      status: stats.generated > 0 ? "waiting_review" : "skipped",
      summary:
        stats.generated > 0
          ? "Waiting for human review. No email will be sent automatically."
          : "No email drafts were generated for review."
    });
    if (stats.generated > 0) {
      await updateRun(runId, {
        status: "waiting_review",
        currentStep: "humanApproveEmail",
        emailReviewStatus: "pending"
      });
    }
  }

  return stats;
}

export async function regenerateEmailDraft(draftId: string) {
  const draft = await getEmailDraft(draftId);
  if (!draft) throw new Error("Email draft not found.");
  if (draft.status === "sent") throw new Error("Sent email drafts cannot be regenerated.");

  const db = await readStore();
  const company = db.companies.find((item) => item.id === draft.companyId);
  if (!company) throw new Error("Company not found.");

  const toEmail =
    draft.toEmail ??
    db.emailAddresses.find((email) => email.id === draft.toEmailAddressId)?.email ??
    chooseRecommendedEmail(
      company,
      db.emailAddresses.filter((email) => email.companyId === company.id)
    )?.email;
  if (!toEmail) throw new Error("No email is available for regeneration.");

  const generated = await buildDraftInput({
    company,
    toEmail,
    emailAddressId: draft.toEmailAddressId,
    evidence: db.evidence.filter((item) => item.companyId === company.id),
    existingDraft: draft
  });

  return updateEmailDraft(draftId, {
    subject: generated.subject,
    body: generated.body,
    status: "waiting_review",
    toEmail,
    usedEvidenceIds: generated.usedEvidenceIds,
    styleNotes: generated.styleNotes,
    personalizationNotes: generated.styleNotes,
    evidenceIds: generated.evidenceIds,
    editedAt: new Date().toISOString()
  });
}

export async function forceGenerateCompanyEmailDraft(companyId: string) {
  const db = await readStore();
  const company = db.companies.find((item) => item.id === companyId);
  if (!company) throw new Error("Company not found.");
  if (company.status === "blacklist") {
    throw new Error("Blacklisted companies cannot receive email drafts.");
  }

  const existingDraft = db.emailDrafts.find(
    (draft) => draft.companyId === company.id && draft.status !== "skipped"
  );
  if (existingDraft) {
    return {
      created: false,
      draft: existingDraft,
      message: "This company already has an active email draft."
    };
  }

  const companyEmails = db.emailAddresses.filter((email) => email.companyId === company.id);
  const selectedEmail = chooseRecommendedEmail(company, companyEmails);
  if (!selectedEmail) throw new Error("No email is available for this company.");

  const draft = await generateDraftForCompany({
    company,
    email: selectedEmail.email,
    emailAddressId: selectedEmail.id,
    evidence: db.evidence.filter((item) => item.companyId === company.id)
  });

  await markRunWaitingForEmailReview(company.runId, "Force-generated 1 email draft for manual review.");

  return {
    created: true,
    draft,
    message: "Email draft generated and queued for human review."
  };
}

async function generateDraftForCompany(input: {
  company: Company;
  email: string;
  emailAddressId?: string;
  evidence: Evidence[];
}) {
  const draftInput = await buildDraftInput({
    company: input.company,
    toEmail: input.email,
    emailAddressId: input.emailAddressId,
    evidence: input.evidence
  });
  const [draft] = await saveEmailDrafts(input.company.runId, [draftInput]);

  await updateCompany(input.company.id, {
    status: "drafted",
    emailDraftIds: [...new Set([...(input.company.emailDraftIds ?? []), draft.id])],
    enrichmentLogs: [
      ...(input.company.enrichmentLogs ?? []),
      {
        step: "generateEmailDraft",
        status: "completed",
        message: `Generated waiting_review draft for ${input.email}.`,
        timestamp: new Date().toISOString()
      }
    ]
  });

  return draft;
}

async function buildDraftInput(input: {
  company: Company;
  toEmail: string;
  emailAddressId?: string;
  evidence: Evidence[];
  existingDraft?: EmailDraft;
}): Promise<SaveEmailDraftInput> {
  const usableEvidence = selectEmailEvidence(input.evidence);
  const evidenceSummary = [
    input.company.evidenceSummary,
    ...usableEvidence.map((item) => `${item.type}: ${item.rawText ?? item.snippet ?? item.title}`)
  ]
    .filter(Boolean)
    .slice(0, 12)
    .join("\n");
  const generated = await minimaxProvider.generateColdEmail({
    companyId: input.company.id,
    companyName: input.company.name,
    country: input.company.country,
    website: input.company.primaryWebsite ?? input.company.website,
    domain: input.company.domain,
    recommendedEmail: input.toEmail,
    productName: input.company.products[0],
    productDescription: input.company.productDescription,
    transactionSummary: input.company.transactionSummary,
    buyerFit: input.company.buyerFitTier ?? "unknown",
    companyRole: input.company.companyRole,
    leadScore: input.company.leadScore,
    suggestedAction: input.company.suggestedAction,
    evidenceSummary,
    reasons: input.company.buyerFitReasons,
    risks: input.company.buyerFitRisks,
    evidenceIds: usableEvidence.map((item) => item.id)
  });
  const usedEvidenceIds = generated.usedEvidenceIds.length > 0
    ? generated.usedEvidenceIds
    : usableEvidence.map((item) => item.id).slice(0, 8);
  const [draftEvidence] = await saveEvidence(input.company.runId, [
    {
      companyId: input.company.id,
      provider: "minimax",
      type: "email_draft",
      source: "minimax",
      title: `Email draft for ${input.company.name}`,
      rawText: [
        `subject=${generated.subject}`,
        generated.body,
        generated.fallbackReason ? `fallback=${generated.fallbackReason}` : ""
      ]
        .filter(Boolean)
        .join("\n"),
      confidence: input.company.confidence ?? 0.7,
      raw: generated,
      rawJson: generated
    }
  ]);

  return {
    id: input.existingDraft?.id ?? stableDraftId(input.company.id, input.toEmail),
    companyId: input.company.id,
    toEmailAddressId: input.emailAddressId,
    toEmail: input.toEmail,
    subject: generated.subject,
    body: generated.body,
    status: "waiting_review",
    provider: "mock",
    personalizationNotes: generated.styleNotes,
    usedEvidenceIds,
    styleNotes: generated.styleNotes,
    evidenceIds: [...new Set([draftEvidence.id, ...usedEvidenceIds])]
  };
}

function isEligibleForEmail(company: Company) {
  if (company.status === "blacklist") return false;
  if (company.suggestedAction === "skip") return false;
  if (company.buyerFitTier === "low") return false;
  return (
    company.buyerFitTier === "high" ||
    company.buyerFitTier === "medium" ||
    company.suggestedAction === "email_first" ||
    company.suggestedAction === "manual_review"
  );
}

function chooseRecommendedEmail(company: Company, emails: EmailAddress[]) {
  const recommended = company.recommendedEmails?.[0];
  if (recommended) {
    const existing = emails.find((email) => email.email.toLowerCase() === recommended.toLowerCase());
    return existing ?? {
      id: undefined,
      email: recommended
    };
  }

  return (
    emails.find((email) => /^(purchase|procurement|sourcing)[._-]?/i.test(email.email.split("@")[0] ?? "")) ??
    emails.find((email) => /^(sales|info|contact)[._-]?/i.test(email.email.split("@")[0] ?? "")) ??
    emails[0]
  );
}

function selectEmailEvidence(evidence: Evidence[]) {
  return evidence
    .filter((item) =>
      [
        "excel_import",
        "website_search",
        "email_search",
        "phone_search",
        "whatsapp_search",
        "social_search",
        "buyer_fit"
      ].includes(item.type)
    )
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

async function appendCompanyDraftLog(company: Company, message: string) {
  await updateCompany(company.id, {
    enrichmentLogs: [
      ...(company.enrichmentLogs ?? []),
      {
        step: "generateEmailDraft",
        status: "not_found",
        message,
        timestamp: new Date().toISOString()
      }
    ]
  });
}

async function markRunWaitingForEmailReview(runId: string, summary: string) {
  await updateRunStep(runId, "generateEmailDraft", {
    status: "completed",
    summary
  });
  await updateRunStep(runId, "humanApproveEmail", {
    status: "waiting_review",
    summary: "Waiting for human review. No email will be sent automatically."
  });
  await updateRun(runId, {
    status: "waiting_review",
    currentStep: "humanApproveEmail",
    emailReviewStatus: "pending"
  });
}

function stableDraftId(companyId: string, toEmail: string) {
  const hash = createHash("sha1").update(`${companyId}:${toEmail}`).digest("hex").slice(0, 12);
  return `email_draft_${hash}`;
}
