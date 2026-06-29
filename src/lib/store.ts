import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  leadGenerationStepLabels,
  leadGenerationStepOrder
} from "@/lib/lead-generation-steps";
import type {
  CompanyResults,
  Company,
  CompanyNote,
  AuditLog,
  Contact,
  ColumnMapping,
  CreateImportJobInput,
  CreateRunInput,
  EmailAddress,
  EmailDraft,
  EmailLog,
  EntityId,
  Evidence,
  ImportJob,
  ImportRow,
  Keyword,
  LocalJsonDatabase,
  PhoneNumber,
  Run,
  RunResults,
  RunStep,
  SearchProviderName,
  SaveContactInput,
  SaveCompanyInput,
  SaveCompanyNoteInput,
  SaveEmailAddressInput,
  SaveEmailDraftInput,
  SaveEmailLogInput,
  SaveEvidenceInput,
  SaveImportRowInput,
  SaveKeywordInput,
  SavePhoneNumberInput,
  SaveAuditLogInput,
  SaveWhatsappNumberInput,
  SearchMode,
  SearchQueryType,
  WhatsappNumber,
  UpdateRunStepInput
} from "@/types";

const dataDir = path.join(process.cwd(), "data");
const storePath = path.join(dataDir, "local-store.json");
let storeWriteQueue = Promise.resolve();

export function createEmptyDatabase(): LocalJsonDatabase {
  return {
    schemaVersion: 1,
    runs: [],
    runSteps: [],
    keywords: [],
    importJobs: [],
    importRows: [],
    columnMappings: [],
    searchQueryLogs: [],
    searchProviderUsage: [],
    companies: [],
    contacts: [],
    emailAddresses: [],
    whatsappNumbers: [],
    phoneNumbers: [],
    evidence: [],
    emailDrafts: [],
    companyNotes: [],
    emailLogs: [],
    auditLogs: [],
    updatedAt: now()
  };
}

export async function readStore(): Promise<LocalJsonDatabase> {
  await ensureStore();
  await storeWriteQueue.catch(() => undefined);
  const content = await fs.readFile(storePath, "utf8");
  return normalizeDatabase(JSON.parse(content));
}

export async function readCrmStore(): Promise<LocalJsonDatabase> {
  return readStore();
}

export async function readReviewStore(): Promise<LocalJsonDatabase> {
  return readStore();
}

export async function writeStore(db: LocalJsonDatabase) {
  const nextDb = {
    ...normalizeDatabase(db),
    updatedAt: now()
  };

  storeWriteQueue = storeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(storePath, JSON.stringify(nextDb, null, 2), "utf8");
    });

  await storeWriteQueue;
  return nextDb;
}

export async function resetStore() {
  return writeStore(createEmptyDatabase());
}

export async function createImportJob(input: CreateImportJobInput): Promise<ImportJob> {
  const db = await readStore();
  const createdAt = input.createdAt ?? now();
  const importJob: ImportJob = {
    ...input,
    id: input.id ?? createId("import_job"),
    errorMessage: input.errorMessage,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt
  };

  await writeStore({
    ...db,
    importJobs: upsertManyById(db.importJobs, [importJob])
  });

  return importJob;
}

export async function updateImportJob(
  importJobId: EntityId,
  patch: Partial<Omit<ImportJob, "id" | "createdAt">>
): Promise<ImportJob> {
  const db = await readStore();
  const existing = db.importJobs.find((job) => job.id === importJobId);

  if (!existing) throw new Error(`Import job not found: ${importJobId}`);

  const updatedAt = now();
  const importJob: ImportJob = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt
  };

  await writeStore({
    ...db,
    importJobs: upsertManyById(db.importJobs, [importJob])
  });

  return importJob;
}

export async function listImportJobs() {
  const db = await readStore();
  return [...db.importJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getImportJob(importJobId: EntityId) {
  const db = await readStore();
  return db.importJobs.find((job) => job.id === importJobId) ?? null;
}

export async function saveImportRows(
  importJobId: EntityId,
  input: SaveImportRowInput[]
): Promise<ImportRow[]> {
  const db = await readStore();
  assertImportJobExists(db, importJobId);

  const timestamp = now();
  const rows: ImportRow[] = input.map((row) => ({
    ...row,
    id: row.id ?? createId("import_row"),
    importJobId,
    rawData: row.rawData ?? {},
    status: row.status ?? "parsed",
    createdAt: row.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    importRows: [...db.importRows.filter((row) => row.importJobId !== importJobId), ...rows]
  });

  return rows;
}

export async function getImportRows(importJobId: EntityId) {
  const db = await readStore();
  return db.importRows
    .filter((row) => row.importJobId === importJobId)
    .sort((a, b) => a.rowIndex - b.rowIndex);
}

export async function saveColumnMapping(input: ColumnMapping): Promise<ColumnMapping> {
  const db = await readStore();
  assertImportJobExists(db, input.importJobId);

  await writeStore({
    ...db,
    columnMappings: [
      ...db.columnMappings.filter((mapping) => mapping.importJobId !== input.importJobId),
      input
    ]
  });

  return input;
}

export async function getColumnMapping(importJobId: EntityId) {
  const db = await readStore();
  return db.columnMappings.find((mapping) => mapping.importJobId === importJobId) ?? null;
}

export async function getImportJobResults(importJobId: EntityId) {
  const db = await readStore();
  const importJob = db.importJobs.find((job) => job.id === importJobId);

  if (!importJob) return null;

  return {
    importJob,
    rows: db.importRows
      .filter((row) => row.importJobId === importJobId)
      .sort((a, b) => a.rowIndex - b.rowIndex),
    mapping: db.columnMappings.find((mapping) => mapping.importJobId === importJobId) ?? null,
    companies: db.companies.filter((company) => company.importJobId === importJobId)
  };
}

export async function recordSearchQueryLog(input: {
  companyId?: EntityId;
  importJobId?: EntityId;
  query: string;
  searchType: SearchQueryType;
  mode: SearchMode;
  provider?: SearchProviderName;
  status: "success" | "failed" | "fallback" | "skipped";
  resultCount: number;
  averageConfidence?: number;
  fallbackReason?: string;
  errorMessage?: string;
}) {
  const db = await readStore();
  const timestamp = now();
  const log = {
    id: createId("search_log"),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input
  };

  await writeStore({
    ...db,
    searchQueryLogs: [...db.searchQueryLogs, log]
  });

  return log;
}

export async function updateSearchProviderUsage(input: {
  provider: SearchProviderName;
  success: boolean;
  fallbackUsed?: boolean;
  errorMessage?: string;
}) {
  const db = await readStore();
  const timestamp = now();
  const existing = db.searchProviderUsage.find((item) => item.provider === input.provider);
  const usage = {
    id: existing?.id ?? createId("search_usage"),
    provider: input.provider,
    totalQueries: (existing?.totalQueries ?? 0) + 1,
    successfulQueries: (existing?.successfulQueries ?? 0) + (input.success ? 1 : 0),
    failedQueries: (existing?.failedQueries ?? 0) + (input.success ? 0 : 1),
    fallbackCount: (existing?.fallbackCount ?? 0) + (input.fallbackUsed ? 1 : 0),
    lastUsedAt: timestamp,
    lastError: input.errorMessage,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  await writeStore({
    ...db,
    searchProviderUsage: [
      ...db.searchProviderUsage.filter((item) => item.provider !== input.provider),
      usage
    ]
  });

  return usage;
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
    buyerFitRisks: company.buyerFitRisks ?? [],
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

export async function saveCompanyNote(input: SaveCompanyNoteInput): Promise<CompanyNote> {
  const db = await readStore();
  const existingCompany = db.companies.find((company) => company.id === input.companyId);

  if (!existingCompany) throw new Error(`Company not found: ${input.companyId}`);

  const timestamp = now();
  const note: CompanyNote = {
    ...input,
    id: input.id ?? createId("company_note"),
    content: input.content.trim(),
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  await writeStore({
    ...db,
    companyNotes: upsertManyById(db.companyNotes, [note])
  });

  return note;
}

export async function listCompanyNotes(companyId: EntityId): Promise<CompanyNote[]> {
  const db = await readStore();
  return db.companyNotes
    .filter((note) => note.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

export async function savePhoneNumbers(runId: EntityId, input: SavePhoneNumberInput[]) {
  const db = await readStore();
  assertRunExists(db, runId);

  const timestamp = now();
  const phoneNumbers: PhoneNumber[] = input.map((phoneNumber) => ({
    ...phoneNumber,
    id: phoneNumber.id ?? createId("phone"),
    runId,
    evidenceIds: phoneNumber.evidenceIds ?? [],
    createdAt: phoneNumber.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    phoneNumbers: upsertManyById(db.phoneNumbers, phoneNumbers)
  });

  return phoneNumbers;
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
    usedEvidenceIds: draft.usedEvidenceIds ?? draft.evidenceIds ?? [],
    styleNotes: draft.styleNotes ?? [],
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

export async function saveAuditLogs(input: SaveAuditLogInput[]) {
  const db = await readStore();
  const timestamp = now();
  const auditLogs: AuditLog[] = input.map((log) => ({
    ...log,
    id: log.id ?? createId("audit_log"),
    createdAt: log.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  await writeStore({
    ...db,
    auditLogs: upsertManyById(db.auditLogs, auditLogs)
  });

  return auditLogs;
}

export async function listAuditLogs(limit = 100) {
  const db = await readStore();
  return [...db.auditLogs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(500, limit)));
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
    phoneNumbers: db.phoneNumbers.filter((phone) => phone.runId === runId),
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
    phoneNumbers: db.phoneNumbers.filter((phone) => phone.companyId === companyId),
    evidence: db.evidence.filter((item) => item.companyId === companyId),
    emailDrafts: db.emailDrafts.filter((draft) => draft.companyId === companyId),
    companyNotes: db.companyNotes
      .filter((note) => note.companyId === companyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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

function normalizeDatabase(input: unknown): LocalJsonDatabase {
  const empty = createEmptyDatabase();

  if (!input || typeof input !== "object") return empty;

  const db = input as Partial<LocalJsonDatabase>;
  return {
    ...empty,
    ...db,
    runs: db.runs ?? [],
    runSteps: db.runSteps ?? [],
    keywords: db.keywords ?? [],
    importJobs: db.importJobs ?? [],
    importRows: db.importRows ?? [],
    columnMappings: db.columnMappings ?? [],
    searchQueryLogs: db.searchQueryLogs ?? [],
    searchProviderUsage: db.searchProviderUsage ?? [],
    companies: db.companies ?? [],
    contacts: db.contacts ?? [],
    emailAddresses: db.emailAddresses ?? [],
    whatsappNumbers: db.whatsappNumbers ?? [],
    phoneNumbers: db.phoneNumbers ?? [],
    evidence: db.evidence ?? [],
    emailDrafts: db.emailDrafts ?? [],
    companyNotes: db.companyNotes ?? [],
    emailLogs: db.emailLogs ?? [],
    auditLogs: db.auditLogs ?? [],
    updatedAt: db.updatedAt ?? empty.updatedAt
  };
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

function assertImportJobExists(db: LocalJsonDatabase, importJobId: EntityId) {
  if (!db.importJobs.some((job) => job.id === importJobId)) {
    throw new Error(`Import job not found: ${importJobId}`);
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
