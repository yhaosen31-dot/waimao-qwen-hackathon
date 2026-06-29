import {
  getCompanyResults,
  getImportJobResults,
  saveEvidence,
  updateCompany,
  updateRunStep
} from "@/repositories/store";
import { minimaxProvider } from "@/providers/minimaxProvider";
import type {
  BuyerFitTier,
  Company,
  Evidence,
  SaveEvidenceInput,
  SuggestedAction
} from "@/types";

export interface BuyerFitScoringStats {
  importJobId: string;
  total: number;
  processed: number;
  remaining: number;
  scored: number;
  failed: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
  manualReview: number;
  needsManualReviewCompanies: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
}

export async function scoreImportJobBuyerFit(
  importJobId: string,
  options: { limit?: number } = {}
): Promise<BuyerFitScoringStats> {
  const results = await getImportJobResults(importJobId);
  if (!results) throw new Error(`Import job not found: ${importJobId}`);

  const scorableCompanies = results.companies.filter((company) =>
    ["completed", "needs_review"].includes(company.enrichmentStatus ?? "")
  );
  const pendingCompanies = scorableCompanies.filter((company) => !company.buyerFitTier);
  const companies = pendingCompanies.slice(0, options.limit ?? pendingCompanies.length);
  const stats: BuyerFitScoringStats = {
    importJobId,
    total: scorableCompanies.length,
    processed: companies.length,
    remaining: Math.max(0, pendingCompanies.length - companies.length),
    scored: 0,
    failed: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    manualReview: 0,
    needsManualReviewCompanies: []
  };
  const runIds = new Set<string>();

  for (const company of companies) {
    runIds.add(company.runId);
    try {
      const companyResults = await getCompanyResults(company.id);
      if (!companyResults) continue;

      const scoringInput = {
        companyId: company.id,
        companyName: company.name,
        country: company.country,
        source: normalizeCompanySource(company.source),
        productName: company.products[0],
        productDescription: company.productDescription,
        transactionSummary: company.transactionSummary,
        website: company.primaryWebsite ?? company.website,
        domain: company.domain,
        emails: companyResults.emailAddresses.map((email) => email.email),
        phones: companyResults.phoneNumbers.map((phone) => phone.number),
        whatsappNumbers: companyResults.whatsappNumbers.map((whatsapp) => whatsapp.number),
        linkedin: company.recommendedSocialLinks?.linkedin,
        facebook: company.recommendedSocialLinks?.facebook,
        evidenceSummary: buildEvidenceSummary(company, companyResults.evidence),
        contactConfidence: company.contactConfidence
      };
      const score = await minimaxProvider.scoreBuyerFit(scoringInput);
      const buyerFitEvidenceInput: SaveEvidenceInput = {
        companyId: company.id,
        provider: "minimax",
        type: "buyer_fit",
        source: "minimax",
        title: `Buyer Fit: ${score.buyerFit}`,
        url: company.primaryWebsite ?? company.website,
        rawText: [
          `buyerFit=${score.buyerFit}`,
          `companyRole=${score.companyRole}`,
          `leadScore=${score.leadScore}`,
          `suggestedAction=${score.suggestedAction}`,
          `reasons=${score.reasons.join("; ")}`,
          `risks=${score.risks.join("; ")}`,
          score.fallbackReason ? `fallback=${score.fallbackReason}` : ""
        ]
          .filter(Boolean)
          .join("\n"),
        confidence: score.confidence,
        raw: {
          input: scoringInput,
          output: score
        },
        rawJson: score
      };
      const [buyerFitEvidence] = await saveEvidence(company.runId, [buyerFitEvidenceInput]);
      const nextEvidenceIds = [...new Set([...company.evidenceIds, buyerFitEvidence.id])];

      await updateCompany(company.id, {
        buyerFitTier: score.buyerFit,
        companyRole: score.companyRole,
        buyerFitScore: score.leadScore,
        leadScore: score.leadScore,
        confidence: score.confidence,
        suggestedAction: score.suggestedAction,
        buyerFitReasons: score.reasons,
        buyerFitRisks: score.risks,
        buyerFit: {
          score: score.leadScore,
          reasons: score.reasons,
          confidence: score.confidence
        },
        evidenceIds: nextEvidenceIds,
        enrichmentLogs: [
          ...(company.enrichmentLogs ?? []),
          {
            step: "scoreBuyerFit",
            status: "completed",
            message: `Buyer Fit ${score.buyerFit}, lead score ${score.leadScore}.`,
            timestamp: new Date().toISOString()
          }
        ]
      });

      stats.scored += 1;
      incrementBuyerFitStats(stats, score.buyerFit, score.suggestedAction);
      if (score.suggestedAction === "manual_review" || score.buyerFit === "unknown") {
        stats.needsManualReviewCompanies.push({
          id: company.id,
          name: company.name,
          reason: score.risks[0] ?? "Requires manual review."
        });
      }
    } catch (error) {
      stats.failed += 1;
      await updateCompany(company.id, {
        enrichmentLogs: [
          ...(company.enrichmentLogs ?? []),
          {
            step: "scoreBuyerFit",
            status: "failed",
            message: error instanceof Error ? error.message : "Unknown Buyer Fit scoring error.",
            timestamp: new Date().toISOString()
          }
        ]
      });
    }
  }

  for (const runId of runIds) {
    const latestResults = await getImportJobResults(importJobId);
    const latestCompanies =
      latestResults?.companies.filter((company) =>
        ["completed", "needs_review"].includes(company.enrichmentStatus ?? "")
      ) ?? [];
    const latestSummary = getBuyerFitSummary(latestCompanies);

    await updateRunStep(runId, "scoreBuyerFit", {
      status: stats.remaining > 0 ? "running" : "completed",
      summary: `Buyer Fit scored ${latestSummary.scored}/${latestCompanies.length} imported companies.`
    });
  }

  const latestResults = await getImportJobResults(importJobId);
  const latestCompanies =
    latestResults?.companies.filter((company) =>
      ["completed", "needs_review"].includes(company.enrichmentStatus ?? "")
    ) ?? [];
  const latestSummary = getBuyerFitSummary(latestCompanies);

  return {
    ...stats,
    scored: latestSummary.scored,
    high: latestSummary.high,
    medium: latestSummary.medium,
    low: latestSummary.low,
    unknown: latestSummary.unknown,
    manualReview: latestSummary.manualReview,
    remaining: latestCompanies.filter((company) => !company.buyerFitTier).length
  };
}

export function getBuyerFitSummary(companies: Company[]) {
  return {
    scored: companies.filter((company) => Boolean(company.buyerFitTier)).length,
    high: companies.filter((company) => company.buyerFitTier === "high").length,
    medium: companies.filter((company) => company.buyerFitTier === "medium").length,
    low: companies.filter((company) => company.buyerFitTier === "low").length,
    unknown: companies.filter((company) => company.buyerFitTier === "unknown").length,
    manualReview: companies.filter((company) => company.suggestedAction === "manual_review").length
  };
}

function buildEvidenceSummary(company: Company, evidence: Evidence[]) {
  return [
    company.evidenceSummary,
    ...evidence
      .filter((item) =>
        [
          "excel_import",
          "website_search",
          "website_not_found",
          "email_search",
          "phone_search",
          "whatsapp_search",
          "social_search"
        ].includes(item.type)
      )
      .map((item) => `${item.type}: ${item.rawText ?? item.snippet ?? item.title ?? ""}`)
  ]
    .filter(Boolean)
    .slice(0, 16)
    .join("\n");
}

function normalizeCompanySource(source: string): "excel_import" | "product_search" | "manual" {
  if (source === "excel_import" || source === "product_search" || source === "manual") return source;
  return "manual";
}

function incrementBuyerFitStats(
  stats: BuyerFitScoringStats,
  buyerFit: BuyerFitTier,
  suggestedAction: SuggestedAction
) {
  stats[buyerFit] += 1;
  if (suggestedAction === "manual_review") stats.manualReview += 1;
}
