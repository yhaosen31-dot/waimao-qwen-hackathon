import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  leadGenerationStepLabels,
  leadGenerationStepOrder
} from "@/mock/mockData";
import type {
  CompanyResults,
  Company,
  Contact,
  CreateRunInput,
  EmailAddress,
  EmailDraft,
  EmailLog,
  EntityId,
  Evidence,
  Keyword,
  LocalJsonDatabase,
  Run,
  RunResults,
  RunStep,
  SaveContactInput,
  SaveCompanyInput,
  SaveEmailAddressInput,
  SaveEmailDraftInput,
  SaveEmailLogInput,
  SaveEvidenceInput,
  SaveKeywordInput,
  SaveWhatsappNumberInput,
  WhatsappNumber,
  UpdateRunStepInput
} from "@/types";

const dataDir = path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "local-store.json");

export function createEmptyDatabase(): LocalJsonDatabase {
  return {
    schemaVersion: 1,
    runs: [],
    runSteps: [],
    keywords: [],
    companies: [],
    contacts: [],
    emailAddresses: [],
    whatsappNumbers: [],
    evidence: [],
    emailDrafts: [],
    emailLogs: [],
    updatedAt: now()
  };
}

export async function readStore(): Promise<LocalJsonDatabase> {
  await ensureStore();
  const content = await fs.readFile(storePath, "utf8");
  return JSON.parse(content) as LocalJsonDatabase;
}

export async function writeStore(db: LocalJsonDatabase) {
  await fs.mkdir(dataDir, { recursive: true });
  const nextDb = {
    ...db,
    updatedAt: now()
  };
  await fs.writeFile(storePath, JSON.stringify(nextDb, null, 2), "utf8");
  return nextDb;
}

export async function resetStore() {
  return writeStore(createEmptyDatabase());
}

export async function createRun(input: CreateRunInput): Promise<Run> {
  const db = await readStore();
  const createdAt = now();
  const run: Run = {
    id: createId("run"),
    productInput: input.productInput,
    normalizedProduct: input.normalizedProduct,
    targetCustomerCount: input.targetCustomerCount,
    status: "created",
    currentStep: "normalizeInput",
    keywordReviewStatus: "pending",
    emailReviewStatus: "pending",
    metadata: input.metadata,
    createdAt,
    updatedAt: createdAt
  };
  const runSteps = createInitialRunSteps(run.id, createdAt);

  await writeStore({
    ...db,
    runs: [...db.runs, run],
    runSteps: [...db.runSteps, ...runSteps]
  });

  return run;
}

export async function listRuns() {
  const db = await readStore();
  return [...db.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateRun(runId: EntityId, patch: Partial<Omit<Run, "id" | "createdAt">>) {
  const db = await readStore();
  assertRunExists(db, runId);

  const updatedAt = now();
  const runs = db.runs.map((run) =>
    run.id === runId
      ? {
          ...run,
          ...patch,
          metadata: patch.metadata ? { ...(run.metadata ?? {}), ...patch.metadata } : run.metadata,
          updatedAt
        }
      : run
  );
  const nextRun = runs.find((run) => run.id === runId);

  await writeStore({
    ...db,
    runs
  });

  if (!nextRun) throw new Error(`Run not found: ${runId}`);
  return nextRun;
}

export async function updateRunStep(
  runId: EntityId,
  stepKey: RunStep["stepKey"],
  patch: UpdateRunStepInput
): Promise<RunStep> {
  const db = await readStore();
  assertRunExists(db, runId);

  const updatedAt = now();
  const existingStep = db.runSteps.find(
    (step) => step.runId === runId && step.stepKey === stepKey
  );
  const step =
    existingStep ??
    createRunStep({
      runId,
      stepKey,
      order: leadGenerationStepOrder.indexOf(stepKey),
      timestamp: updatedAt
    });

  const nextStep: RunStep = {
    ...step,
    ...patch,
    status: patch.status ?? step.status,
    startedAt: patch.status === "running" ? patch.startedAt ?? step.startedAt ?? updatedAt : patch.startedAt ?? step.startedAt,
    completedAt:
      patch.status === "completed" || patch.status === "failed" || patch.status === "skipped"
        ? patch.completedAt ?? updatedAt
        : patch.completedAt ?? step.completedAt,
    updatedAt
  };

  const runSteps = upsertById(db.runSteps, nextStep);
  const runs = db.runs.map((run) =>
    run.id === runId
      ? {
          ...run,
          currentStep: stepKey,
          status: statusFromStep(nextStep.status),
          updatedAt
        }
      : run
  );

  await writeStore({
    ...db,
    runs,
    runSteps
  });

  return nextStep;
}

export async function saveKeywords(runId: EntityId, input: SaveKeywordInput[]) {
  const db = await readStore();
  assertRunExists(db, runId);

  const timestamp = now();
  const keywords: Keyword[] = input.map((keyword) => ({
    ...keyword,
    id: keyword.id ?? createId("keyword"),
    runId,
    evidenceIds: keyword.evidenceIds ?? [],
    createdAt: keyword.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    keywords: upsertManyById(db.keywords, keywords)
  });

  return keywords;
}

export async function saveCompanies(runId: EntityId, input: SaveCompanyInput[]) {
  const db = await readStore();
  assertRunExists(db, runId);

  const timestamp = now();
  const companies = input.map((company) => ({
    ...company,
    id: company.id ?? createId("company"),
    runId,
    products: company.products ?? [],
    emails: company.emails ?? [],
    whatsappNumbers: company.whatsappNumbers ?? [],
    buyerFitReasons: company.buyerFitReasons ?? [],
    buyerFit: company.buyerFit ?? {
      score: company.buyerFitScore ?? 0,
      reasons: company.buyerFitReasons ?? [],
      confidence: company.confidence ?? 0.8
    },
    leadScore: company.leadScore ?? company.buyerFitScore ?? 0,
    confidence: company.confidence ?? 0.8,
    status: company.status ?? "new",
    emailDraftIds: company.emailDraftIds ?? [],
    evidenceIds: company.evidenceIds ?? [],
    createdAt: company.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    companies: upsertManyById(db.companies, companies)
  });

  return companies;
}

export async function updateCompany(
  companyId: EntityId,
  patch: Partial<Omit<Company, "id" | "createdAt">>
) {
  const db = await readStore();
  const existing = db.companies.find((company) => company.id === companyId);

  if (!existing) throw new Error(`Company not found: ${companyId}`);

  const updatedAt = now();
  const company: Company = {
    ...existing,
    ...patch,
    id: existing.id,
    runId: patch.runId ?? existing.runId,
    createdAt: existing.createdAt,
    updatedAt
  };

  await writeStore({
    ...db,
    companies: upsertManyById(db.companies, [company])
  });

  return company;
}

export async function updateCompaniesForRun(
  runId: EntityId,
  patcher: (company: Company) => Partial<Company>
) {
  const db = await readStore();
  assertRunExists(db, runId);

  const updatedAt = now();
  const companies = db.companies.map((company) =>
    company.runId === runId
      ? {
          ...company,
          ...patcher(company),
          updatedAt
        }
      : company
  );

  await writeStore({
    ...db,
    companies
  });

  return companies.filter((company) => company.runId === runId);
}

export async function saveContacts(runId: EntityId, input: SaveContactInput[]) {
  const db = await readStore();
  assertRunExists(db, runId);

  const timestamp = now();
  const contacts: Contact[] = input.map((contact) => ({
    ...contact,
    id: contact.id ?? createId("contact"),
    runId,
    evidenceIds: contact.evidenceIds ?? [],
    createdAt: contact.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    contacts: upsertManyById(db.contacts, contacts)
  });

  return contacts;
}

export async function saveEmailAddresses(runId: EntityId, input: SaveEmailAddressInput[]) {
  const db = await readStore();
  assertRunExists(db, runId);

  const timestamp = now();
  const emailAddresses: EmailAddress[] = input.map((emailAddress) => ({
    ...emailAddress,
    id: emailAddress.id ?? createId("email"),
    runId,
    evidenceIds: emailAddress.evidenceIds ?? [],
    createdAt: emailAddress.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    emailAddresses: upsertManyById(db.emailAddresses, emailAddresses)
  });

  return emailAddresses;
}

export async function saveWhatsappNumbers(runId: EntityId, input: SaveWhatsappNumberInput[]) {
  const db = await readStore();
  assertRunExists(db, runId);

  const timestamp = now();
  const whatsappNumbers: WhatsappNumber[] = input.map((whatsappNumber) => ({
    ...whatsappNumber,
    id: whatsappNumber.id ?? createId("whatsapp"),
    runId,
    evidenceIds: whatsappNumber.evidenceIds ?? [],
    createdAt: whatsappNumber.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    whatsappNumbers: upsertManyById(db.whatsappNumbers, whatsappNumbers)
  });

  return whatsappNumbers;
}

export async function saveEvidence(runId: EntityId, input: SaveEvidenceInput[]) {
  const db = await readStore();
  assertRunExists(db, runId);

  const timestamp = now();
  const evidence: Evidence[] = input.map((item) => ({
    ...item,
    id: item.id ?? createId("evidence"),
    runId,
    source: item.source ?? item.provider,
    rawText: item.rawText ?? item.snippet,
    confidence: item.confidence ?? 0.8,
    createdAt: item.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    evidence: upsertManyById(db.evidence, evidence)
  });

  return evidence;
}

export async function saveEmailDrafts(runId: EntityId, input: SaveEmailDraftInput[]) {
  const db = await readStore();
  assertRunExists(db, runId);

  const timestamp = now();
  const emailDrafts: EmailDraft[] = input.map((draft) => ({
    ...draft,
    id: draft.id ?? createId("email_draft"),
    runId,
    status: draft.status ?? "draft",
    personalizationNotes: draft.personalizationNotes ?? [],
    evidenceIds: draft.evidenceIds ?? [],
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    emailDrafts: upsertManyById(db.emailDrafts, emailDrafts)
  });

  return emailDrafts;
}

export async function updateEmailDraft(
  draftId: EntityId,
  patch: Partial<Omit<EmailDraft, "id" | "runId" | "createdAt">>
) {
  const db = await readStore();
  const existing = db.emailDrafts.find((draft) => draft.id === draftId);

  if (!existing) throw new Error(`Email draft not found: ${draftId}`);

  const updatedAt = now();
  const draft: EmailDraft = {
    ...existing,
    ...patch,
    id: existing.id,
    runId: existing.runId,
    createdAt: existing.createdAt,
    updatedAt
  };

  await writeStore({
    ...db,
    emailDrafts: upsertManyById(db.emailDrafts, [draft])
  });

  return draft;
}

export async function updateEmailDraftsForRun(
  runId: EntityId,
  patcher: (draft: EmailDraft) => Partial<EmailDraft>
) {
  const db = await readStore();
  assertRunExists(db, runId);

  const updatedAt = now();
  const emailDrafts = db.emailDrafts.map((draft) =>
    draft.runId === runId
      ? {
          ...draft,
          ...patcher(draft),
          updatedAt
        }
      : draft
  );

  await writeStore({
    ...db,
    emailDrafts
  });

  return emailDrafts.filter((draft) => draft.runId === runId);
}

export async function saveEmailLogs(runId: EntityId, input: SaveEmailLogInput[]) {
  const db = await readStore();
  assertRunExists(db, runId);

  const timestamp = now();
  const emailLogs: EmailLog[] = input.map((log) => ({
    ...log,
    id: log.id ?? createId("email_log"),
    runId,
    createdAt: log.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    emailLogs: upsertManyById(db.emailLogs, emailLogs)
  });

  return emailLogs;
}

export async function getRunResults(runId: EntityId): Promise<RunResults | null> {
  const db = await readStore();
  const run = db.runs.find((item) => item.id === runId);

  if (!run) return null;

  const companyIds = new Set(
    db.companies.filter((company) => company.runId === runId).map((company) => company.id)
  );
  const contactIds = new Set(
    db.contacts.filter((contact) => contact.runId === runId).map((contact) => contact.id)
  );

  return {
    run,
    runSteps: db.runSteps
      .filter((step) => step.runId === runId)
      .sort((a, b) => a.order - b.order),
    keywords: db.keywords.filter((keyword) => keyword.runId === runId),
    companies: db.companies.filter((company) => company.runId === runId),
    contacts: db.contacts.filter((contact) => contact.runId === runId),
    emailAddresses: db.emailAddresses.filter((email) => email.runId === runId),
    whatsappNumbers: db.whatsappNumbers.filter((whatsapp) => whatsapp.runId === runId),
    evidence: db.evidence.filter(
      (evidence) =>
        evidence.runId === runId ||
        (evidence.companyId ? companyIds.has(evidence.companyId) : false) ||
        (evidence.contactId ? contactIds.has(evidence.contactId) : false)
    ),
    emailDrafts: db.emailDrafts.filter((draft) => draft.runId === runId),
    emailLogs: db.emailLogs.filter((log) => log.runId === runId)
  };
}

export async function listCompanies() {
  const db = await readStore();
  return [...db.companies].sort((a, b) => (b.buyerFitScore ?? 0) - (a.buyerFitScore ?? 0));
}

export async function listEmailDrafts() {
  const db = await readStore();
  return [...db.emailDrafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEmailDraft(draftId: EntityId) {
  const db = await readStore();
  return db.emailDrafts.find((draft) => draft.id === draftId) ?? null;
}

export async function getCompanyResults(companyId: EntityId): Promise<CompanyResults | null> {
  const db = await readStore();
  const company = db.companies.find((item) => item.id === companyId);

  if (!company) return null;

  return {
    company,
    contacts: db.contacts.filter((contact) => contact.companyId === companyId),
    emailAddresses: db.emailAddresses.filter((email) => email.companyId === companyId),
    whatsappNumbers: db.whatsappNumbers.filter((whatsapp) => whatsapp.companyId === companyId),
    evidence: db.evidence.filter((item) => item.companyId === companyId),
    emailDrafts: db.emailDrafts.filter((draft) => draft.companyId === companyId),
    emailLogs: db.emailLogs.filter((log) => log.companyId === companyId)
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(storePath);
  } catch {
    await fs.writeFile(storePath, JSON.stringify(createEmptyDatabase(), null, 2), "utf8");
  }
}

function createInitialRunSteps(runId: EntityId, timestamp: string): RunStep[] {
  return leadGenerationStepOrder.map((stepKey, index) =>
    createRunStep({
      runId,
      stepKey,
      order: index,
      timestamp
    })
  );
}

function createRunStep(input: {
  runId: EntityId;
  stepKey: RunStep["stepKey"];
  order: number;
  timestamp: string;
}): RunStep {
  return {
    id: createId("run_step"),
    runId: input.runId,
    stepKey: input.stepKey,
    order: input.order,
    label: leadGenerationStepLabels[input.stepKey],
    status: "pending",
    createdAt: input.timestamp,
    updatedAt: input.timestamp
  };
}

function assertRunExists(db: LocalJsonDatabase, runId: EntityId) {
  if (!db.runs.some((run) => run.id === runId)) {
    throw new Error(`Run not found: ${runId}`);
  }
}

function statusFromStep(status: RunStep["status"]): Run["status"] {
  if (status === "waiting_review") return "waiting_review";
  if (status === "paused") return "paused";
  if (status === "failed") return "failed";
  if (status === "completed") return "running";
  if (status === "running") return "running";
  return "created";
}

function upsertById<T extends { id: EntityId }>(items: T[], nextItem: T) {
  return upsertManyById(items, [nextItem]);
}

function upsertManyById<T extends { id: EntityId }>(items: T[], nextItems: T[]) {
  const nextIds = new Set(nextItems.map((item) => item.id));
  return [...items.filter((item) => !nextIds.has(item.id)), ...nextItems];
}

function createId(prefix: string) {
  return `${prefix}_${nanoid(10)}`;
}

function now() {
  return new Date().toISOString();
}
