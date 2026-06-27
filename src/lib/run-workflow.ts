import { nanoid } from "nanoid";
import { mockLeadCompanies } from "@/server/integrations/mock/mock-data";
import {
  createRun,
  getRunResults,
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
  Company,
  Contact,
  EmailAddress,
  EntityId,
  Evidence,
  Keyword,
  SaveCompanyInput,
  SaveContactInput,
  SaveEmailAddressInput,
  SaveEmailDraftInput,
  SaveEmailLogInput,
  SaveEvidenceInput,
  SaveWhatsappNumberInput
} from "@/types";

export async function startMockLeadRun(input: {
  productInput: string;
  targetCustomerCount: number;
}) {
  const normalizedProduct = normalizeProduct(input.productInput);
  const run = await createRun({
    productInput: input.productInput,
    normalizedProduct,
    targetCustomerCount: input.targetCustomerCount,
    metadata: {
      mode: "mock",
      externalApiCalls: 0
    }
  });

  await completeStep(run.id, "normalizeInput", `Normalized to "${normalizedProduct}".`);
  await updateRun(run.id, {
    normalizedProduct,
    status: "running",
    currentStep: "generateKeywords"
  });

  const keywords = await generateMockKeywords(run.id, normalizedProduct);
  await completeStep(run.id, "generateKeywords", `Generated ${keywords.length} English keywords.`);
  await updateRunStep(run.id, "humanApproveKeywords", {
    status: "waiting_review",
    summary: "Waiting for human keyword approval.",
    startedAt: new Date().toISOString()
  });
  await updateRun(run.id, {
    status: "waiting_review",
    currentStep: "humanApproveKeywords"
  });

  return getRunResults(run.id);
}

export async function approveKeywordsAndContinue(runId: EntityId, approvedKeywordIds: EntityId[]) {
  const results = await getRunResults(runId);
  if (!results) throw new Error(`Run not found: ${runId}`);

  const approvedSet = new Set(approvedKeywordIds);
  const selectedKeywords = results.keywords.filter((keyword) => approvedSet.has(keyword.id));

  if (selectedKeywords.length === 0) {
    throw new Error("Select at least one keyword before continuing.");
  }

  await saveKeywords(
    runId,
    results.keywords.map((keyword) => ({
      ...keyword,
      status: approvedSet.has(keyword.id) ? "approved" : "rejected"
    }))
  );
  await completeStep(
    runId,
    "humanApproveKeywords",
    `Approved ${selectedKeywords.length} keywords for mock importer discovery.`
  );
  await updateRun(runId, {
    keywordReviewStatus: "approved",
    status: "running",
    currentStep: "searchCrossBorderImporters"
  });

  await runRemainingMockNodes(runId, selectedKeywords);

  return getRunResults(runId);
}

async function runRemainingMockNodes(runId: EntityId, keywords: Keyword[]) {
  const results = await getRunResults(runId);
  if (!results) throw new Error(`Run not found: ${runId}`);

  const targetCount = results.run.targetCustomerCount;
  const importerCandidates = mockLeadCompanies.slice(0, targetCount).map((lead, index) => ({
    ...lead,
    matchedKeyword: keywords[index % keywords.length]?.value ?? keywords[0]?.value
  }));

  await completeStep(
    runId,
    "searchCrossBorderImporters",
    `Found ${importerCandidates.length} mock importer candidates.`
  );

  const companyDrafts = importerCandidates.map<SaveCompanyInput>((lead, index) => {
    const domain = lead.website ? domainFromWebsite(lead.website) : mockDomain(lead.companyName);
    const evidenceId = scopedId("evidence", runId, index, "directory");

    return {
      id: scopedId("company", runId, index),
      name: lead.companyName,
      country: lead.country,
      city: lead.city,
      website: lead.website ?? `https://www.${domain}`,
      domain,
      industry: "Industrial hydraulics",
      products: lead.products,
      importerProfile: lead.importerProfile,
      buyerFitScore: 0,
      buyerFitReasons: [],
      source: "mock",
      evidenceIds: [evidenceId]
    };
  });

  const evidenceDrafts = companyDrafts.map<SaveEvidenceInput>((company, index) => ({
    id: company.evidenceIds[0],
    companyId: company.id,
    provider: "mock",
    type: "search_result",
    title: `${company.name} mock importer profile`,
    url: company.website,
    snippet: `Mock search evidence matched "${importerCandidates[index]?.matchedKeyword}".`,
    raw: {
      source: "mock-cross-border-search",
      matchedKeyword: importerCandidates[index]?.matchedKeyword
    }
  }));

  const evidence = await saveEvidence(runId, evidenceDrafts);
  await completeStep(
    runId,
    "extractCompanyDetails",
    `Extracted company details and evidence for ${companyDrafts.length} companies.`
  );
  await completeStep(runId, "discoverWebsite", "Mock website discovery completed for all companies.");

  const scoredCompanies = companyDrafts.map((company, index) => ({
    ...company,
    buyerFitScore: Math.min(96, 72 + (index % 6) * 4 + (company.domain ? 4 : 0)),
    buyerFitReasons: [
      "Product catalog overlaps with diaphragm accumulator demand.",
      "Profile suggests recurring industrial replacement-parts purchasing.",
      `${company.country ?? "Target"} market matched mock importer signal.`
    ]
  }));
  const companies = await saveCompanies(runId, scoredCompanies);

  const contacts = await saveContacts(runId, buildContacts(runId, companies));
  const emailAddresses = await saveEmailAddresses(runId, buildEmails(runId, companies, contacts));
  await completeStep(
    runId,
    "searchEmailsByDomain",
    `Generated ${emailAddresses.length} mock email addresses.`
  );

  const whatsappNumbers = await saveWhatsappNumbers(runId, buildWhatsapps(runId, companies, contacts));
  await completeStep(
    runId,
    "discoverWhatsappAndContacts",
    `Generated ${contacts.length} contacts and ${whatsappNumbers.length} WhatsApp numbers.`
  );

  await completeStep(runId, "scoreBuyerFit", `Scored ${companies.length} buyer profiles.`);

  const emailDrafts = await saveEmailDrafts(
    runId,
    buildEmailDrafts(runId, companies, contacts, emailAddresses, evidence)
  );
  await completeStep(runId, "generateEmailDraft", `Generated ${emailDrafts.length} mock email drafts.`);

  await completeStep(runId, "humanApproveEmail", "Mock email approval completed automatically.");
  await updateRun(runId, {
    emailReviewStatus: "approved"
  });

  const emailLogs = await saveEmailLogs(runId, buildEmailLogs(runId, emailDrafts));
  await completeStep(
    runId,
    "saveEmailDraft",
    `Saved ${emailLogs.length} email drafts locally. No real sending was performed.`
  );
  await completeStep(runId, "saveToCrm", `Saved ${companies.length} companies to the local CRM.`);

  await updateRun(runId, {
    status: "completed",
    currentStep: "saveToCrm"
  });
}

async function generateMockKeywords(runId: EntityId, normalizedProduct: string) {
  const keywordValues = [
    normalizedProduct,
    "hydraulic accumulator",
    "diaphragm accumulator supplier",
    "hydraulic accumulator importer",
    "industrial hydraulic accumulator",
    "pressure accumulator for hydraulic system",
    "nitrogen charged diaphragm accumulator",
    "hydraulic spare parts distributor"
  ];

  return saveKeywords(
    runId,
    keywordValues.map((value, index) => ({
      value,
      language: "en",
      source: "mock",
      status: "pending",
      confidence: Math.max(0.76, 0.96 - index * 0.03),
      evidenceIds: []
    }))
  );
}

async function completeStep(
  runId: EntityId,
  stepKey: Parameters<typeof updateRunStep>[1],
  summary: string
) {
  const startedAt = new Date().toISOString();
  await updateRunStep(runId, stepKey, {
    status: "running",
    summary: "Running",
    startedAt
  });
  await updateRunStep(runId, stepKey, {
    status: "completed",
    summary,
    completedAt: new Date().toISOString()
  });
}

function buildContacts(runId: EntityId, companies: Company[]): SaveContactInput[] {
  return companies.map((company, index) => ({
    id: scopedId("contact", runId, index),
    companyId: company.id,
    fullName: mockContactName(index),
    title: index % 2 === 0 ? "Procurement Manager" : "Import Manager",
    department: "Procurement",
    source: "mock",
    confidence: 0.82,
    evidenceIds: company.evidenceIds
  }));
}

function buildEmails(
  runId: EntityId,
  companies: Company[],
  contacts: Contact[]
): SaveEmailAddressInput[] {
  return companies.flatMap((company, index) => {
    const contact = contacts.find((item) => item.companyId === company.id);
    const domain = company.domain ?? mockDomain(company.name);

    return [
      {
        id: scopedId("email", runId, index, "procurement"),
        companyId: company.id,
        contactId: contact?.id,
        email: `procurement@${domain}`,
        domain,
        source: "mock",
        confidence: 0.91,
        verificationStatus: "unverified",
        evidenceIds: company.evidenceIds
      },
      {
        id: scopedId("email", runId, index, "sales"),
        companyId: company.id,
        email: `sales@${domain}`,
        domain,
        source: "mock",
        confidence: 0.76,
        verificationStatus: "unverified",
        evidenceIds: company.evidenceIds
      }
    ];
  });
}

function buildWhatsapps(
  runId: EntityId,
  companies: Company[],
  contacts: Contact[]
): SaveWhatsappNumberInput[] {
  return companies.map((company, index) => {
    const contact = contacts.find((item) => item.companyId === company.id);

    return {
      id: scopedId("whatsapp", runId, index),
      companyId: company.id,
      contactId: contact?.id,
      number: `+1${String(7000000000 + index * 11357)}`,
      countryCode: "1",
      source: "mock",
      confidence: 0.79,
      evidenceIds: company.evidenceIds
    };
  });
}

function buildEmailDrafts(
  runId: EntityId,
  companies: Company[],
  contacts: Contact[],
  emailAddresses: EmailAddress[],
  evidence: Evidence[]
): SaveEmailDraftInput[] {
  return companies.map((company, index) => {
    const contact = contacts.find((item) => item.companyId === company.id);
    const email = emailAddresses.find((item) => item.companyId === company.id);
    const companyEvidence = evidence.filter((item) => item.companyId === company.id);

    return {
      id: scopedId("email_draft", runId, index),
      companyId: company.id,
      contactId: contact?.id,
      toEmailAddressId: email?.id,
      subject: `Diaphragm accumulator supply for ${company.name}`,
      body: [
        `Hi ${contact?.fullName ?? "Procurement Team"},`,
        "",
        `I noticed ${company.name} works with ${company.products.join(", ")}.`,
        "We manufacture diaphragm accumulators and related hydraulic accumulator parts for importers and distributors.",
        "",
        "Could I send a short catalog and learn which pressure range and volume you usually purchase?",
        "",
        "Best regards,"
      ].join("\n"),
      status: "saved",
      provider: "mock",
      personalizationNotes: company.buyerFitReasons,
      evidenceIds: companyEvidence.map((item) => item.id)
    };
  });
}

function buildEmailLogs(runId: EntityId, emailDrafts: Awaited<ReturnType<typeof saveEmailDrafts>>) {
  return emailDrafts.map<SaveEmailLogInput>((draft, index) => ({
    id: scopedId("email_log", runId, index),
    emailDraftId: draft.id,
    companyId: draft.companyId,
    provider: "mock",
    action: "save_draft",
    status: "success",
    attemptedAt: new Date().toISOString()
  }));
}

function normalizeProduct(productInput: string) {
  return productInput.trim().replace(/\s+/g, " ").toLowerCase();
}

function domainFromWebsite(website: string) {
  return website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function mockDomain(companyName: string) {
  return `${companyName
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 28)}.com`;
}

function mockContactName(index: number) {
  const contacts = [
    "Daniel Brooks",
    "Maja Lindstrom",
    "Carlos Rivera",
    "Priya Menon",
    "Thomas Weber",
    "Hannah Clarke",
    "Renata Costa",
    "Oliver Wright",
    "Noura Haddad",
    "Luis Ortega",
    "Kenji Sato",
    "Valeria Rojas",
    "Ethan Campbell",
    "Selin Kaya",
    "Piotr Nowak",
    "Julia Bauer",
    "Sipho Dlamini",
    "Minh Tran",
    "Kristjan Tamm",
    "Nikos Antoniou"
  ];

  return contacts[index % contacts.length];
}

function scopedId(prefix: string, runId: EntityId, index: number, suffix = "") {
  const cleanRunId = runId.replace(/[^a-zA-Z0-9]/g, "");
  const cleanSuffix = suffix ? `_${suffix}` : "";
  return `${prefix}_${cleanRunId}_${index + 1}${cleanSuffix}_${nanoid(4)}`;
}
