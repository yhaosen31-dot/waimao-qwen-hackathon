import {
  leadGenerationNodeLabels,
  type GraphCompany,
  type GraphEmailDraft,
  type LeadGenerationGraphState
} from "@/graphs/state";
import {
  saveCompanies,
  saveContacts,
  saveEmailAddresses,
  saveEmailDrafts,
  saveEvidence,
  saveKeywords,
  saveWhatsappNumbers,
  updateRun,
  updateRunStep
} from "@/repositories/store";
import type {
  CompanyStatus,
  RunStatus,
  SaveCompanyInput,
  SaveContactInput,
  SaveEmailAddressInput,
  SaveEmailDraftInput,
  EvidenceProvider,
  SaveEvidenceInput,
  SaveWhatsappNumberInput
} from "@/types";

export async function persistGraphRunState(
  state: LeadGenerationGraphState,
  options: {
    runStatus: RunStatus;
  }
) {
  await persistRunSteps(state);
  await persistKeywords(state);

  if (state.companies.length > 0) {
    await persistCompaniesAndDrafts(state);
  }

  await updateRun(state.runId, {
    status: options.runStatus,
    currentStep: state.currentStep,
    metadata: state.errors.length > 0 ? { searchErrors: state.errors } : undefined,
    keywordReviewStatus: state.approvedKeywords.length > 0 ? "approved" : "pending",
    emailReviewStatus:
      state.emailDrafts.length > 0 &&
      state.emailDrafts.every((draft) => draft.status === "approved" || draft.status === "skipped")
        ? "approved"
        : "pending"
  });
}

async function persistRunSteps(state: LeadGenerationGraphState) {
  for (const [stepKey, status] of Object.entries(state.progress)) {
    const step = stepKey as keyof typeof leadGenerationNodeLabels;
    const lastLog = [...state.logs]
      .reverse()
      .find((log) => log.step === step && log.status === status);

    await updateRunStep(state.runId, step, {
      status,
      summary: lastLog?.message ?? leadGenerationNodeLabels[step],
      startedAt: status === "running" ? new Date().toISOString() : undefined,
      completedAt: status === "completed" ? new Date().toISOString() : undefined
    });
  }
}

async function persistKeywords(state: LeadGenerationGraphState) {
  const approvedSet = new Set(state.approvedKeywords);
  const insightByValue = new Map(state.keywordInsights.map((insight) => [insight.value, insight]));

  await saveKeywords(
    state.runId,
    state.keywords.map((keyword) => {
      const insight = insightByValue.get(keyword);

      return {
        value: keyword,
        language: "en" as const,
        source: "llm" as const,
        status:
          approvedSet.size === 0
            ? ("pending" as const)
            : approvedSet.has(keyword)
              ? ("approved" as const)
              : ("rejected" as const),
        confidence: insight?.score ?? 0.9,
        reason: insight?.reason ?? "MiniMax keyword generated for importer discovery.",
        evidenceIds: []
      };
    })
  );
}

async function persistCompaniesAndDrafts(state: LeadGenerationGraphState) {
  const evidenceInputs = buildEvidenceInputs(state.runId, state.companies);
  const evidence = await saveEvidence(state.runId, evidenceInputs);

  const companies = await saveCompanies(
    state.runId,
    state.companies.map<SaveCompanyInput>((company) => ({
      id: company.id,
      name: company.name,
      country: company.country,
      city: company.city,
      website: company.website,
      domain: company.domain,
      industry: "Industrial hydraulics",
      products: company.products,
      importerProfile: company.importerProfile,
      emails: company.emails,
      whatsappNumbers: company.whatsapp ? [company.whatsapp] : [],
      buyerFit: {
        score: company.buyerFitScore ?? 0,
        reasons: company.buyerFitReasons,
        confidence: company.confidence ?? 0.8
      },
      buyerFitTier: company.buyerFitTier,
      companyRole: company.companyRole,
      buyerFitScore: company.buyerFitScore ?? 0,
      buyerFitReasons: company.buyerFitReasons,
      buyerFitRisks: company.buyerFitRisks,
      leadScore: company.leadScore ?? company.buyerFitScore ?? 0,
      confidence: company.confidence ?? 0.8,
      suggestedAction: company.suggestedAction,
      sourceKeyword: company.sourceKeyword,
      sourceQuery: company.sourceQuery,
      sourceProvider: company.sourceProvider,
      enrichmentStatus: company.enrichmentStatus,
      websiteStatus: company.websiteStatus,
      contactStatus: company.contactStatus,
      contactConfidence: company.contactConfidence,
      evidenceSummary: company.evidenceSummary,
      status: resolvePersistedCompanyStatus(company, state.emailDrafts),
      source: companySource(company),
      evidenceIds: evidence.filter((item) => item.companyId === company.id).map((item) => item.id),
      emailDraftIds: state.emailDrafts
        .filter((draft) => draft.companyId === company.id)
        .map((draft) => draft.id ?? `${draft.companyId}_email_draft_1`)
    }))
  );

  const contacts = await saveContacts(state.runId, buildContactInputs(companies, state.companies));
  await saveEmailAddresses(state.runId, buildEmailInputs(companies, state.companies, contacts));
  await saveWhatsappNumbers(state.runId, buildWhatsappInputs(companies, state.companies, contacts));

  if (state.emailDrafts.length > 0) {
    await saveEmailDrafts(
      state.runId,
      buildEmailDraftInputs(state.emailDrafts, contacts, evidence)
    );
  }
}

function resolvePersistedCompanyStatus(
  company: GraphCompany,
  emailDrafts: GraphEmailDraft[]
): CompanyStatus {
  const draft = emailDrafts.find((item) => item.companyId === company.id);
  if (draft?.status === "approved") return "email_approved";
  if (draft?.status === "skipped") return "email_skipped";
  if (draft) return "drafted";
  if (company.buyerFitTier) return "scored";
  if (company.enrichmentStatus === "completed" || company.enrichmentStatus === "needs_review") {
    return "enriched";
  }
  return company.status ?? "product_search_candidate";
}

function buildEvidenceInputs(runId: string, companies: GraphCompany[]): SaveEvidenceInput[] {
  return companies.flatMap((company) =>
    company.evidence.map((item, index) => ({
      id: `${company.id}_evidence_${index + 1}`,
      companyId: company.id,
      provider: providerFromGraphEvidence(item),
      type: item.type,
      source: item.source ?? item.type,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      rawText: item.rawText ?? item.snippet,
      confidence: item.confidence,
      raw: {
        runId,
        ...item
      }
    }))
  );
}

function buildContactInputs(
  companies: Array<{ id: string; evidenceIds: string[] }>,
  graphCompanies: GraphCompany[]
): SaveContactInput[] {
  return companies.map((company) => {
    const graphCompany = graphCompanies.find((item) => item.id === company.id);

    return {
      id: `${company.id}_contact_1`,
      companyId: company.id,
      fullName: graphCompany?.contactName ?? "Procurement Contact",
      title: graphCompany?.contactTitle ?? "Procurement Manager",
      department: "Procurement",
      source: sourceForGraphCompany(graphCompany),
      confidence: 0.8,
      evidenceIds: company.evidenceIds
    };
  });
}

function buildEmailInputs(
  companies: Array<{ id: string; domain?: string; evidenceIds: string[] }>,
  graphCompanies: GraphCompany[],
  contacts: Array<{ id: string; companyId: string }>
): SaveEmailAddressInput[] {
  return companies.flatMap((company) => {
    const graphCompany = graphCompanies.find((item) => item.id === company.id);
    const contact = contacts.find((item) => item.companyId === company.id);

    return (graphCompany?.emails ?? []).map((email, index) => ({
      id: `${company.id}_email_${index + 1}`,
      companyId: company.id,
      contactId: index === 0 ? contact?.id : undefined,
      email,
      domain: company.domain ?? email.split("@")[1] ?? "",
      source: sourceForGraphCompany(graphCompany),
      confidence: index === 0 ? 0.9 : 0.75,
      verificationStatus: "unverified" as const,
      evidenceIds: company.evidenceIds
    }));
  });
}

function buildWhatsappInputs(
  companies: Array<{ id: string; evidenceIds: string[] }>,
  graphCompanies: GraphCompany[],
  contacts: Array<{ id: string; companyId: string }>
): SaveWhatsappNumberInput[] {
  return companies.flatMap((company) => {
    const graphCompany = graphCompanies.find((item) => item.id === company.id);
    const contact = contacts.find((item) => item.companyId === company.id);
    const whatsapp = graphCompany?.whatsapp?.trim();

    if (!whatsapp) return [];

    return [
      {
        id: `${company.id}_whatsapp_1`,
        companyId: company.id,
        contactId: contact?.id,
        number: whatsapp,
        source: sourceForGraphCompany(graphCompany),
        confidence: 0.78,
        evidenceIds: company.evidenceIds
      }
    ];
  });
}

function companySource(company: GraphCompany): EvidenceProvider {
  return company.evidence.some((item) => item.type === "product_search") ? "product_search" : "manual";
}

function sourceForGraphCompany(company: GraphCompany | undefined): EvidenceProvider {
  if (!company) return "manual";
  const searchEvidence = company.evidence.find((item) => providerFromSource(item.source) !== "mock");
  if (searchEvidence) return providerFromSource(searchEvidence.source);
  return companySource(company);
}

function providerFromGraphEvidence(item: GraphCompany["evidence"][number]): EvidenceProvider {
  if (item.type === "buyer_fit") return "minimax";
  return providerFromSource(item.source) ?? (item.type === "product_search" ? "product_search" : "manual");
}

function providerFromSource(value: string | undefined): EvidenceProvider {
  if (
    value === "excel_import" ||
    value === "product_search" ||
    value === "cross_border_search" ||
    value === "website_search" ||
    value === "foreign_trade_email" ||
    value === "exa" ||
    value === "tavily" ||
    value === "you" ||
    value === "minimax" ||
    value === "manual" ||
    value === "mock"
  ) {
    return value;
  }

  return "manual";
}

function buildEmailDraftInputs(
  emailDrafts: GraphEmailDraft[],
  contacts: Array<{ id: string; companyId: string }>,
  evidence: Array<{ id: string; companyId?: string }>
): SaveEmailDraftInput[] {
  return emailDrafts.map((draft) => {
    const contact = contacts.find((item) => item.companyId === draft.companyId);
    const companyEvidence = evidence.filter((item) => item.companyId === draft.companyId);

    return {
      id: draft.id ?? `${draft.companyId}_email_draft_1`,
      companyId: draft.companyId,
      contactId: contact?.id,
      subject: draft.subject,
      body: draft.body,
      toEmail: draft.toEmail ?? draft.to,
      status: draft.status,
      approvedAt: draft.approvedAt,
      skippedAt: draft.skippedAt,
      editedAt: draft.editedAt,
      provider: "mock",
      personalizationNotes: draft.personalizationNotes,
      evidenceIds: companyEvidence.map((item) => item.id)
    };
  });
}
