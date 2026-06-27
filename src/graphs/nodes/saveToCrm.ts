import { completeNode, leadGenerationNodeLabels, type LeadGenerationGraphState } from "@/graphs/state";
import {
  saveCompanies,
  saveContacts,
  saveEmailAddresses,
  saveEmailDrafts,
  saveEmailLogs,
  saveEvidence,
  saveKeywords,
  saveWhatsappNumbers,
  updateRun,
  updateRunStep
} from "@/lib/store";
import type {
  SaveCompanyInput,
  SaveContactInput,
  SaveEmailAddressInput,
  SaveEmailDraftInput,
  SaveEmailLogInput,
  SaveEvidenceInput,
  SaveWhatsappNumberInput
} from "@/types";

export async function saveToCrm(state: LeadGenerationGraphState) {
  const completed = completeNode(
    state,
    "saveToCrm",
    `Saved ${state.companies.length} companies and ${state.emailDrafts.length} drafts to local CRM.`
  );
  const nextState = {
    ...state,
    ...completed
  };

  await saveKeywords(
    state.runId,
    state.keywords.map((keyword) => {
      const insight = state.keywordInsights.find((item) => item.value === keyword);

      return {
        value: keyword,
        language: "en" as const,
        source: "mock" as const,
        status: state.approvedKeywords.includes(keyword)
          ? ("approved" as const)
          : ("rejected" as const),
        confidence: insight?.score ?? 0.9,
        reason: insight?.reason ?? "Mock keyword generated for importer discovery.",
        evidenceIds: []
      };
    })
  );

  const evidenceInputs: SaveEvidenceInput[] = nextState.companies.flatMap((company) =>
    company.evidence.map((item, index) => ({
      id: `${company.id}_evidence_${index + 1}`,
      companyId: company.id,
      provider: "mock",
      type: item.type,
      source: item.source ?? item.type,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      rawText: item.rawText ?? item.snippet,
      confidence: item.confidence,
      raw: item
    }))
  );
  const evidence = await saveEvidence(state.runId, evidenceInputs);

  const companyInputs: SaveCompanyInput[] = nextState.companies.map((company) => ({
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
    buyerFitScore: company.buyerFitScore ?? 0,
    buyerFitReasons: company.buyerFitReasons,
    leadScore: company.leadScore ?? company.buyerFitScore ?? 0,
    confidence: company.confidence ?? 0.8,
    sourceKeyword: company.sourceKeyword,
    status: "saved_to_crm",
    source: "mock",
    evidenceIds: evidence.filter((item) => item.companyId === company.id).map((item) => item.id),
    emailDraftIds: nextState.emailDrafts
      .filter((draft) => draft.companyId === company.id)
      .map((draft) => draft.id ?? `${draft.companyId}_email_draft_1`)
  }));
  const companies = await saveCompanies(state.runId, companyInputs);

  const contactInputs: SaveContactInput[] = companies.map((company) => {
    const graphCompany = nextState.companies.find((item) => item.id === company.id);

    return {
      id: `${company.id}_contact_1`,
      companyId: company.id,
      fullName: graphCompany?.contactName ?? "Mock Procurement Manager",
      title: graphCompany?.contactTitle ?? "Procurement Manager",
      department: "Procurement",
      source: "mock",
      confidence: 0.8,
      evidenceIds: company.evidenceIds
    };
  });
  const contacts = await saveContacts(state.runId, contactInputs);

  const emailInputs: SaveEmailAddressInput[] = companies.flatMap((company) => {
    const graphCompany = nextState.companies.find((item) => item.id === company.id);
    const contact = contacts.find((item) => item.companyId === company.id);

    return (graphCompany?.emails ?? []).map((email, index) => ({
      id: `${company.id}_email_${index + 1}`,
      companyId: company.id,
      contactId: index === 0 ? contact?.id : undefined,
      email,
      domain: company.domain ?? email.split("@")[1] ?? "",
      source: "mock",
      confidence: index === 0 ? 0.9 : 0.75,
      verificationStatus: "unverified" as const,
      evidenceIds: company.evidenceIds
    }));
  });
  const emails = await saveEmailAddresses(state.runId, emailInputs);

  const whatsappInputs: SaveWhatsappNumberInput[] = companies.map((company) => {
    const graphCompany = nextState.companies.find((item) => item.id === company.id);
    const contact = contacts.find((item) => item.companyId === company.id);

    return {
      id: `${company.id}_whatsapp_1`,
      companyId: company.id,
      contactId: contact?.id,
      number: graphCompany?.whatsapp ?? "+17000000000",
      countryCode: "1",
      source: "mock",
      confidence: 0.78,
      evidenceIds: company.evidenceIds
    };
  });
  await saveWhatsappNumbers(state.runId, whatsappInputs);

  const draftInputs: SaveEmailDraftInput[] = nextState.emailDrafts.map((draft) => {
    const email = emails.find((item) => item.companyId === draft.companyId && item.email === draft.to);
    const contact = contacts.find((item) => item.companyId === draft.companyId);
    const companyEvidence = evidence.filter((item) => item.companyId === draft.companyId);

    return {
      id: draft.id ?? `${draft.companyId}_email_draft_1`,
      companyId: draft.companyId,
      contactId: contact?.id,
      toEmailAddressId: email?.id,
      toEmail: draft.toEmail ?? draft.to,
      subject: draft.subject,
      body: draft.body,
      status: draft.status,
      approvedAt: draft.approvedAt,
      skippedAt: draft.skippedAt,
      editedAt: draft.editedAt,
      provider: "mock",
      personalizationNotes: draft.personalizationNotes,
      evidenceIds: companyEvidence.map((item) => item.id)
    };
  });
  const emailDrafts = await saveEmailDrafts(state.runId, draftInputs);

  const emailLogInputs: SaveEmailLogInput[] = emailDrafts.map((draft) => ({
    id: `${draft.id}_log_1`,
    emailDraftId: draft.id,
    companyId: draft.companyId,
    provider: "mock",
    action: "save_draft",
    status: draft.status === "skipped" ? "skipped" : "success",
    attemptedAt: new Date().toISOString()
  }));
  await saveEmailLogs(state.runId, emailLogInputs);

  for (const [stepKey, status] of Object.entries(nextState.progress)) {
    const step = stepKey as keyof typeof leadGenerationNodeLabels;
    const lastLog = [...nextState.logs]
      .reverse()
      .find((log) => log.step === step && log.status === status);

    await updateRunStep(state.runId, step, {
      status: status === "completed" ? "completed" : status,
      summary: lastLog?.message ?? leadGenerationNodeLabels[step],
      completedAt: status === "completed" ? new Date().toISOString() : undefined
    });
  }

  await updateRun(state.runId, {
    status: "completed",
    currentStep: "saveToCrm",
    keywordReviewStatus: "approved",
    emailReviewStatus: "approved"
  });

  return completed;
}
