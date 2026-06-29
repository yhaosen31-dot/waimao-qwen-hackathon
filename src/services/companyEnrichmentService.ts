import { createHash } from "node:crypto";
import {
  getImportJobResults,
  saveEmailAddresses,
  saveEvidence,
  savePhoneNumbers,
  saveWhatsappNumbers,
  updateCompany
} from "@/repositories/store";
import { discoverCompanyContacts } from "@/services/contactDiscoveryService";
import { mergeCompanyEvidence } from "@/services/evidenceMergeService";
import { discoverCompanyWebsite } from "@/services/websiteDiscoveryService";
import type { Company, EvidenceProvider, SaveEmailAddressInput, SavePhoneNumberInput, SaveWhatsappNumberInput } from "@/types";

export type ImportJobEnrichmentTarget = "default" | "missing_contacts" | "failed";

export interface ImportJobEnrichmentStats {
  importJobId: string;
  target: ImportJobEnrichmentTarget;
  total: number;
  eligible: number;
  concurrency: number;
  processed: number;
  remaining: number;
  completed: number;
  failed: number;
  websiteFound: number;
  websiteNotFound: number;
  emailsFound: number;
  whatsappFound: number;
  needsReviewCompanies: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
  providerAttempts: Array<{
    provider: string;
    status: string;
    resultCount: number;
    averageConfidence?: number;
  }>;
}

export async function enrichImportJobCompanies(
  importJobId: string,
  options: {
    force?: boolean;
    limit?: number;
    offset?: number;
    target?: ImportJobEnrichmentTarget;
    concurrency?: number;
  } = {}
): Promise<ImportJobEnrichmentStats> {
  const results = await getImportJobResults(importJobId);

  if (!results) throw new Error(`Import job not found: ${importJobId}`);

  const companies = results.companies.filter((company) => company.source === "excel_import");
  const target = options.target ?? "default";
  const concurrency = boundedInteger(
    options.concurrency ?? process.env.ENRICHMENT_COMPANY_CONCURRENCY,
    1,
    1,
    5
  );
  const eligibleCompanies = companies.filter((company) =>
    shouldEnrichCompany(company, {
      force: options.force === true,
      target
    })
  );
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const companiesToProcess = eligibleCompanies.slice(
    offset,
    offset + (options.limit ?? eligibleCompanies.length)
  );
  const stats: ImportJobEnrichmentStats = {
    importJobId,
    target,
    total: companies.length,
    eligible: eligibleCompanies.length,
    concurrency,
    processed: 0,
    remaining: Math.max(0, eligibleCompanies.length - offset),
    completed: 0,
    failed: 0,
    websiteFound: 0,
    websiteNotFound: 0,
    emailsFound: 0,
    whatsappFound: 0,
    needsReviewCompanies: [],
    providerAttempts: []
  };

  const companyResults = await mapWithConcurrency(
    companiesToProcess,
    concurrency,
    (company) => enrichOneCompany(importJobId, company)
  );

  for (const result of companyResults) {
    stats.processed += result.processed;
    stats.completed += result.completed;
    stats.failed += result.failed;
    stats.websiteFound += result.websiteFound;
    stats.websiteNotFound += result.websiteNotFound;
    stats.emailsFound += result.emailsFound;
    stats.whatsappFound += result.whatsappFound;
    stats.needsReviewCompanies.push(...result.needsReviewCompanies);
    stats.providerAttempts.push(...result.providerAttempts);
  }

  stats.remaining = Math.max(0, eligibleCompanies.length - offset - stats.processed);
  return stats;
}

interface CompanyEnrichmentResult {
  processed: number;
  completed: number;
  failed: number;
  websiteFound: number;
  websiteNotFound: number;
  emailsFound: number;
  whatsappFound: number;
  needsReviewCompanies: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
  providerAttempts: Array<{
    provider: string;
    status: string;
    resultCount: number;
    averageConfidence?: number;
  }>;
}

function emptyCompanyEnrichmentResult(): CompanyEnrichmentResult {
  return {
    processed: 1,
    completed: 0,
    failed: 0,
    websiteFound: 0,
    websiteNotFound: 0,
    emailsFound: 0,
    whatsappFound: 0,
    needsReviewCompanies: [],
    providerAttempts: []
  };
}

async function enrichOneCompany(
  importJobId: string,
  company: Company
): Promise<CompanyEnrichmentResult> {
  const result = emptyCompanyEnrichmentResult();

  try {
    await updateCompany(company.id, {
      enrichmentStatus: "running",
      websiteStatus: company.websiteStatus ?? "not_started",
      contactStatus: company.contactStatus ?? "not_started",
      enrichmentLogs: [
        ...(company.enrichmentLogs ?? []),
        logItem("enrichCompanies", "completed", "Started Excel import enrichment.")
      ]
    });

    const websiteResult = await discoverCompanyWebsite({
      companyId: company.id,
      importJobId,
      runId: company.runId,
      companyName: company.name,
      country: company.country,
      productDescription: company.productDescription,
      transactionSummary: company.transactionSummary
    });
    const websiteEvidence = await saveEvidence(company.runId, websiteResult.evidence);
    const website = websiteResult.website ?? company.website;
    const domain = websiteResult.domain ?? company.domain;

    result.providerAttempts.push(...summarizeAttempts(websiteResult.providerAttempts));
    if (websiteResult.website) result.websiteFound += 1;
    if (websiteResult.notFound) result.websiteNotFound += 1;

    const contactResult = await discoverCompanyContacts({
      companyId: company.id,
      importJobId,
      companyName: company.name,
      country: company.country,
      website,
      domain
    });
    const contactEvidence = await saveEvidence(company.runId, contactResult.evidence);
    result.providerAttempts.push(...summarizeAttempts(contactResult.providerAttempts));

    await saveEmailAddresses(company.runId, buildEmailInputs(company, contactResult.emails));
    await saveWhatsappNumbers(company.runId, buildWhatsappInputs(company, contactResult.whatsappNumbers));
    await savePhoneNumbers(company.runId, buildPhoneInputs(company, contactResult.phones));

    const merged = mergeCompanyEvidence({
      website: websiteResult,
      contacts: contactResult
    });
    const evidenceIds = [
      ...new Set([
        ...company.evidenceIds,
        ...websiteEvidence.map((item) => item.id),
        ...contactEvidence.map((item) => item.id)
      ])
    ];
    const contactStatus = resolveContactStatus({
      emailCount: merged.recommendedEmails.length,
      phone: merged.recommendedPhone,
      whatsapp: merged.recommendedWhatsapp,
      socialCount: Object.values(merged.recommendedSocialLinks).filter(Boolean).length,
      needsReview: merged.needsReview
    });
    const websiteStatus = websiteResult.needsReview
      ? "needs_review"
      : websiteResult.notFound
        ? "not_found"
        : "found";
    const enrichmentStatus =
      websiteResult.needsReview || merged.needsReview ? "needs_review" : "completed";

    await updateCompany(company.id, {
      website: merged.primaryWebsite ?? website,
      primaryWebsite: merged.primaryWebsite ?? website,
      domain: merged.primaryDomain ?? domain,
      emails: merged.recommendedEmails,
      whatsappNumbers: merged.recommendedWhatsapp ? [merged.recommendedWhatsapp] : [],
      recommendedEmails: merged.recommendedEmails,
      recommendedPhone: merged.recommendedPhone,
      recommendedWhatsapp: merged.recommendedWhatsapp,
      recommendedSocialLinks: merged.recommendedSocialLinks,
      contactConfidence: merged.contactConfidence,
      evidenceSummary: merged.evidenceSummary,
      evidenceIds,
      websiteStatus,
      contactStatus,
      enrichmentStatus,
      enrichmentLogs: [
        ...(company.enrichmentLogs ?? []),
        logItem(
          "discoverWebsite",
          websiteStatus === "not_found" ? "not_found" : websiteStatus === "needs_review" ? "needs_review" : "completed",
          websiteStatus === "not_found"
            ? "No official website found."
            : websiteStatus === "needs_review"
              ? "Multiple website candidates require review."
              : `Recommended website: ${merged.primaryWebsite ?? website}`
        ),
        logItem(
          "discoverContacts",
          contactStatus === "not_found" ? "not_found" : contactStatus === "needs_review" ? "needs_review" : "completed",
          merged.evidenceSummary
        ),
        logItem("mergeEvidence", merged.needsReview ? "needs_review" : "completed", merged.evidenceSummary)
      ]
    });

    if (merged.recommendedEmails.length > 0) result.emailsFound += merged.recommendedEmails.length;
    if (merged.recommendedWhatsapp) result.whatsappFound += 1;
    if (enrichmentStatus === "needs_review") {
      result.needsReviewCompanies.push({
        id: company.id,
        name: company.name,
        reason: websiteResult.needsReview
          ? "Multiple possible official websites."
          : "Low contact confidence."
      });
    } else {
      result.completed += 1;
    }
  } catch (error) {
    result.failed += 1;
    await updateCompany(company.id, {
      enrichmentStatus: "failed",
      enrichmentLogs: [
        ...(company.enrichmentLogs ?? []),
        logItem(
          "enrichCompanies",
          "failed",
          error instanceof Error ? error.message : "Unknown enrichment error."
        )
      ]
    });
  }

  return result;
}

export async function getImportJobEnrichmentSummary(importJobId: string) {
  const results = await getImportJobResults(importJobId);
  if (!results) return null;

  const companies = results.companies;
  const completed = companies.filter((company) => company.enrichmentStatus === "completed").length;
  const failed = companies.filter((company) => company.enrichmentStatus === "failed").length;
  const running = companies.filter((company) => company.enrichmentStatus === "running").length;
  const needsReview = companies.filter((company) => company.enrichmentStatus === "needs_review").length;
  const websiteFound = companies.filter((company) => company.websiteStatus === "found").length;
  const websiteNotFound = companies.filter((company) => company.websiteStatus === "not_found").length;

  return {
    total: companies.length,
    completed,
    failed,
    running,
    needsReview,
    websiteFound,
    websiteNotFound
  };
}

function buildEmailInputs(company: Company, emails: Array<{ email: string; confidence: number; sourceProvider: string; evidenceId: string }>): SaveEmailAddressInput[] {
  return emails.map((candidate) => ({
    id: stableEntityId("email", company.id, candidate.email),
    companyId: company.id,
    email: candidate.email,
    domain: candidate.email.split("@")[1] ?? "",
    source: candidate.sourceProvider as EvidenceProvider,
    confidence: candidate.confidence,
    verificationStatus: "unverified",
    evidenceIds: [candidate.evidenceId]
  }));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function shouldEnrichCompany(
  company: Company,
  options: { force: boolean; target: ImportJobEnrichmentTarget }
) {
  if (company.status === "blacklist") return false;

  if (options.target === "failed") {
    return company.enrichmentStatus === "failed";
  }

  if (options.target === "missing_contacts") {
    return company.enrichmentStatus !== "running" && missingEmailOrWhatsapp(company);
  }

  if (options.force) return company.enrichmentStatus !== "running";

  return !["completed", "needs_review", "failed"].includes(company.enrichmentStatus ?? "pending");
}

function missingEmailOrWhatsapp(company: Company) {
  const hasEmail = Boolean(
    company.recommendedEmails?.length ||
      company.emails?.length
  );
  const hasWhatsapp = Boolean(
    company.recommendedWhatsapp ||
      company.whatsappNumbers?.length
  );

  return !hasEmail || !hasWhatsapp;
}

function buildWhatsappInputs(company: Company, whatsapps: Array<{ number: string; countryCode?: string; confidence: number; sourceProvider: string; evidenceId: string }>): SaveWhatsappNumberInput[] {
  return whatsapps.map((candidate) => ({
    id: stableEntityId("whatsapp", company.id, candidate.number),
    companyId: company.id,
    number: candidate.number,
    countryCode: candidate.countryCode,
    source: candidate.sourceProvider as EvidenceProvider,
    confidence: candidate.confidence,
    evidenceIds: [candidate.evidenceId]
  }));
}

function buildPhoneInputs(company: Company, phones: Array<{ number: string; countryCode?: string; confidence: number; sourceProvider: string; evidenceId: string }>): SavePhoneNumberInput[] {
  return phones.map((candidate) => ({
    id: stableEntityId("phone", company.id, candidate.number),
    companyId: company.id,
    number: candidate.number,
    countryCode: candidate.countryCode,
    source: candidate.sourceProvider as EvidenceProvider,
    confidence: candidate.confidence,
    evidenceIds: [candidate.evidenceId]
  }));
}

function resolveContactStatus(input: {
  emailCount: number;
  phone?: string;
  whatsapp?: string;
  socialCount: number;
  needsReview: boolean;
}) {
  if (input.needsReview) return "needs_review";
  const foundCount =
    (input.emailCount > 0 ? 1 : 0) +
    (input.phone ? 1 : 0) +
    (input.whatsapp ? 1 : 0) +
    (input.socialCount > 0 ? 1 : 0);
  if (foundCount === 0) return "not_found";
  if (foundCount < 2) return "partial";
  return "found";
}

function logItem(
  step: string,
  status: "completed" | "failed" | "needs_review" | "not_found",
  message: string
) {
  return {
    step,
    status,
    message,
    timestamp: new Date().toISOString()
  };
}

function summarizeAttempts(
  attempts: Array<{
    provider: string;
    status: string;
    resultCount: number;
    averageConfidence?: number;
  }>
) {
  return attempts.map((attempt) => ({
    provider: attempt.provider,
    status: attempt.status,
    resultCount: attempt.resultCount,
    averageConfidence: attempt.averageConfidence
  }));
}

function stableEntityId(prefix: string, companyId: string, value: string) {
  const hash = createHash("sha1").update(`${companyId}:${value}`).digest("hex").slice(0, 12);
  return `${prefix}_${hash}`;
}
