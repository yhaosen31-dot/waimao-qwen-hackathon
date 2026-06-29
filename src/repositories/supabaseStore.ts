import { nanoid } from "nanoid";
import { leadGenerationStepLabels, leadGenerationStepOrder } from "@/lib/lead-generation-steps";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dataStoreStatus, supabaseAdminConfig } from "@/lib/supabase/config";
import type {
  ColumnMapping,
  Company,
  CompanyNote,
  AuditLog,
  CompanyResults,
  Contact,
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
  SaveCompanyInput,
  SaveCompanyNoteInput,
  SaveContactInput,
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
  SearchProviderName,
  SearchQueryLog,
  SearchQueryType,
  SearchProviderUsage,
  UpdateRunStepInput,
  WhatsappNumber
} from "@/types";

type Row = Record<string, unknown>;
type IdMap = Map<string, string>;

const defaultOrganizationLegacyId = "default_org";
const defaultOrganizationName = "Default Organization";
const childTables = [
  "email_logs",
  "audit_logs",
  "email_drafts",
  "evidence",
  "company_social_links",
  "company_phones",
  "company_emails",
  "contacts",
  "search_query_logs",
  "search_provider_usage",
  "keywords",
  "run_steps",
  "import_rows",
  "column_mappings",
  "companies",
  "import_jobs",
  "runs"
];
const optionalTables = new Set(["audit_logs"]);
const missingOptionalTableUntil = new Map<string, number>();

type SupabaseStoreCacheState = {
  readStoreCache: { db: LocalJsonDatabase; expiresAt: number } | null;
  crmStoreCache: { db: LocalJsonDatabase; expiresAt: number } | null;
  reviewStoreCache: { db: LocalJsonDatabase; expiresAt: number } | null;
  importJobResultsCache: Map<
    string,
    {
      value: { importJob: ImportJob; rows: ImportRow[]; mapping: ColumnMapping | null; companies: Company[] } | null;
      expiresAt: number;
    }
  >;
  runResultsCache: Map<string, { value: RunResults | null; expiresAt: number }>;
  companyResultsCache: Map<string, { value: CompanyResults | null; expiresAt: number }>;
};

const cacheState = ((globalThis as typeof globalThis & {
  __waimaoSupabaseStoreCache?: SupabaseStoreCacheState;
}).__waimaoSupabaseStoreCache ??= {
  readStoreCache: null,
  crmStoreCache: null,
  reviewStoreCache: null,
  importJobResultsCache: new Map(),
  runResultsCache: new Map(),
  companyResultsCache: new Map()
});

function readStoreCacheMs() {
  if (process.env.QUEUE_ENABLED === "true") return 0;
  const parsed = Number(process.env.SUPABASE_STORE_CACHE_MS ?? "3000");
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function pageStoreCacheMs() {
  const fallback = process.env.QUEUE_ENABLED === "true" ? "0" : "10000";
  const parsed = Number(process.env.SUPABASE_PAGE_CACHE_MS ?? process.env.SUPABASE_STORE_CACHE_MS ?? fallback);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

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
  const cached = getCachedStore();
  if (cached) return cached;

  const supabase = requireSupabase();
  const organizationId = await ensureDefaultOrganization();
  const [
    runs,
    runSteps,
    keywords,
    importJobs,
    importRows,
    columnMappings,
    searchQueryLogs,
    searchProviderUsage,
    companies,
    contacts,
    emailRows,
    phoneRows,
    evidence,
    emailDrafts,
    companyNotes,
    emailLogs,
    auditLogs
  ] = await Promise.all([
    selectRows("runs", organizationId),
    selectRows("run_steps", organizationId),
    selectRows("keywords", organizationId),
    selectRows("import_jobs", organizationId),
    selectRows("import_rows", organizationId),
    selectRows("column_mappings", organizationId),
    selectRows("search_query_logs", organizationId),
    selectRows("search_provider_usage", organizationId),
    selectRows("companies", organizationId),
    selectRows("contacts", organizationId),
    selectRows("company_emails", organizationId),
    selectRows("company_phones", organizationId),
    selectRows("evidence", organizationId),
    selectRows("email_drafts", organizationId),
    selectRows("company_notes", organizationId),
    selectRows("email_logs", organizationId),
    selectRowsIfExists("audit_logs", organizationId)
  ]);
  void supabase;
  const runIdByUuid = reverseMap(runs);
  const importJobIdByUuid = reverseMap(importJobs);
  const companyIdByUuid = reverseMap(companies);
  const contactIdByUuid = reverseMap(contacts);
  const emailIdByUuid = reverseMap(emailRows);
  const draftIdByUuid = reverseMap(emailDrafts);

  const db: LocalJsonDatabase = {
    schemaVersion: 1,
    runs: runs.map(rowToRun),
    runSteps: runSteps.map((row) => rowToRunStep(row, runIdByUuid)),
    keywords: keywords.map((row) => rowToKeyword(row, runIdByUuid)),
    importJobs: importJobs.map((row) => rowToImportJob(row, runIdByUuid)),
    importRows: importRows.map((row) => rowToImportRow(row, importJobIdByUuid)),
    columnMappings: columnMappings.map((row) => rowToColumnMapping(row, importJobIdByUuid)),
    searchQueryLogs: searchQueryLogs.map((row) =>
      rowToSearchQueryLog(row, companyIdByUuid, importJobIdByUuid)
    ),
    searchProviderUsage: searchProviderUsage.map(rowToSearchProviderUsage),
    companies: companies.map((row) => rowToCompany(row, runIdByUuid, importJobIdByUuid)),
    contacts: contacts.map((row) => rowToContact(row, runIdByUuid, companyIdByUuid)),
    emailAddresses: emailRows.map((row) =>
      rowToEmailAddress(row, runIdByUuid, companyIdByUuid, contactIdByUuid)
    ),
    whatsappNumbers: phoneRows
      .filter((row) => row.phone_type === "whatsapp")
      .map((row) => rowToWhatsappNumber(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    phoneNumbers: phoneRows
      .filter((row) => row.phone_type !== "whatsapp")
      .map((row) => rowToPhoneNumber(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    evidence: evidence.map((row) => rowToEvidence(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    emailDrafts: emailDrafts.map((row) =>
      rowToEmailDraft(row, runIdByUuid, companyIdByUuid, contactIdByUuid, emailIdByUuid)
    ),
    companyNotes: companyNotes.map((row) => rowToCompanyNote(row, companyIdByUuid)),
    emailLogs: emailLogs.map((row) => rowToEmailLog(row, runIdByUuid, companyIdByUuid, draftIdByUuid)),
    auditLogs: auditLogs.map((row) => rowToAuditLog(row, runIdByUuid, companyIdByUuid, draftIdByUuid)),
    updatedAt: now()
  };

  setCachedStore(db);
  return db;
}

export async function writeStore(db: LocalJsonDatabase) {
  if (process.env.SUPABASE_ALLOW_FULL_STORE_WRITE !== "true") {
    throw new Error(
      "Supabase full-store writes are disabled. Use repository incremental methods or set SUPABASE_ALLOW_FULL_STORE_WRITE=true only for one-time migrations."
    );
  }

  const organizationId = await ensureDefaultOrganization();
  invalidateReadStoreCache();

  for (const table of childTables) {
    await deleteOrganizationRowsIfExists(table, organizationId);
  }

  const runMap = await insertRuns(organizationId, db.runs);
  const importJobMap = await insertImportJobs(organizationId, db.importJobs, runMap);
  await insertImportRows(organizationId, db.importRows, importJobMap);
  await insertColumnMappings(organizationId, db.columnMappings, importJobMap);
  await insertRunSteps(organizationId, db.runSteps, runMap);
  await insertKeywords(organizationId, db.keywords, runMap);
  await insertSearchProviderUsage(organizationId, db.searchProviderUsage);
  const companyMap = await insertCompanies(organizationId, db.companies, runMap, importJobMap);
  const contactMap = await insertContacts(organizationId, db.contacts, runMap, companyMap);
  const emailMap = await insertEmailAddresses(organizationId, db.emailAddresses, runMap, companyMap, contactMap);
  await insertPhones(organizationId, db.phoneNumbers, db.whatsappNumbers, runMap, companyMap, contactMap);
  const evidenceMap = await insertEvidence(organizationId, db.evidence, runMap, companyMap, contactMap);
  const draftMap = await insertEmailDrafts(
    organizationId,
    db.emailDrafts,
    runMap,
    companyMap,
    contactMap,
    emailMap,
    evidenceMap
  );
  await insertEmailLogs(organizationId, db.emailLogs, runMap, companyMap, draftMap);
  await insertAuditLogs(organizationId, db.auditLogs, runMap, companyMap, draftMap);
  await insertCompanyNotes(organizationId, db.companyNotes, companyMap);
  await insertSearchQueryLogs(organizationId, db.searchQueryLogs, companyMap, importJobMap);

  const nextDb = {
    ...db,
    updatedAt: now()
  };
  setCachedStore(nextDb);
  return nextDb;
}

export async function resetStore() {
  return writeStore(createEmptyDatabase());
}

export async function createImportJob(input: CreateImportJobInput): Promise<ImportJob> {
  const organizationId = await ensureDefaultOrganization();
  const createdAt = input.createdAt ?? now();
  const importJob: ImportJob = {
    ...input,
    id: input.id ?? createId("import_job"),
    errorMessage: input.errorMessage,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt
  };
  const runMap = await legacyUuidMap("runs", organizationId, [importJob.runId]);
  const rows = await upsertRows("import_jobs", [
    {
      organization_id: organizationId,
      legacy_id: importJob.id,
      file_name: importJob.fileName,
      file_path: importJob.filePath,
      status: importJob.status,
      total_rows: importJob.totalRows,
      parsed_rows: importJob.parsedRows,
      company_count: importJob.companyCount,
      deduped_company_count: importJob.dedupedCompanyCount,
      missing_company_name_count: importJob.missingCompanyNameCount,
      error_message: importJob.errorMessage,
      run_id: lookup(runMap, importJob.runId),
      created_at: importJob.createdAt,
      updated_at: importJob.updatedAt
    }
  ]);
  invalidateReadStoreCache();
  return rowToImportJob(rows[0], runMap);
}

export async function updateImportJob(
  importJobId: EntityId,
  patch: Partial<Omit<ImportJob, "id" | "createdAt">>
): Promise<ImportJob> {
  const organizationId = await ensureDefaultOrganization();
  const existing = await selectRowByLegacyId("import_jobs", organizationId, importJobId);
  if (!existing) throw new Error(`Import job not found: ${importJobId}`);
  const runMap = await legacyUuidMap("runs", organizationId, [patch.runId]);
  const patchRow = compactRow({
    file_name: patch.fileName,
    file_path: patch.filePath,
    status: patch.status,
    total_rows: patch.totalRows,
    parsed_rows: patch.parsedRows,
    company_count: patch.companyCount,
    deduped_company_count: patch.dedupedCompanyCount,
    missing_company_name_count: patch.missingCompanyNameCount,
    error_message: patch.errorMessage,
    run_id: patch.runId ? lookup(runMap, patch.runId) : undefined,
    updated_at: now()
  });
  const updated = await updateRowById("import_jobs", stringValue(existing.id), patchRow);
  invalidateReadStoreCache();
  return rowToImportJob(updated, runMap);
}

export async function listImportJobs() {
  const organizationId = await ensureDefaultOrganization();
  const [importJobs, runs] = await Promise.all([
    selectRows("import_jobs", organizationId),
    selectRows("runs", organizationId)
  ]);
  const runIdByUuid = reverseMap(runs);
  return importJobs
    .map((row) => rowToImportJob(row, runIdByUuid))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getImportJob(importJobId: EntityId) {
  const organizationId = await ensureDefaultOrganization();
  const [importJob, runs] = await Promise.all([
    selectRowByLegacyId("import_jobs", organizationId, importJobId),
    selectRows("runs", organizationId)
  ]);
  if (!importJob) return null;
  return rowToImportJob(importJob, reverseMap(runs));
}

export async function saveImportRows(importJobId: EntityId, input: SaveImportRowInput[]) {
  const organizationId = await ensureDefaultOrganization();
  const importJob = await selectRowByLegacyId("import_jobs", organizationId, importJobId);
  if (!importJob) throw new Error(`Import job not found: ${importJobId}`);
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

  const supabase = requireSupabase();
  const { error: deleteError } = await supabase
    .from("import_rows")
    .delete()
    .eq("organization_id", organizationId)
    .eq("import_job_id", stringValue(importJob.id));
  if (deleteError) throw new Error(`Supabase delete import_rows failed: ${deleteError.message}`);

  await insertRows(
    "import_rows",
    rows.map((row) => ({
      organization_id: organizationId,
      import_job_id: stringValue(importJob.id),
      legacy_id: row.id,
      row_index: row.rowIndex,
      raw_data: row.rawData,
      company_name: row.companyName,
      normalized_company_name: row.normalizedCompanyName,
      country: row.country,
      product_description: row.productDescription,
      transaction_summary: row.transactionSummary,
      source_keyword: row.sourceKeyword,
      status: row.status,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    }))
  );
  invalidateReadStoreCache();
  return rows;
}

export async function getImportRows(importJobId: EntityId) {
  const organizationId = await ensureDefaultOrganization();
  const importJob = await selectRowByLegacyId("import_jobs", organizationId, importJobId);
  if (!importJob) return [];
  const rows = await selectRowsByColumn(
    "import_rows",
    organizationId,
    "import_job_id",
    stringValue(importJob.id)
  );
  const importJobIdByUuid = reverseMap([importJob]);
  return rows
    .map((row) => rowToImportRow(row, importJobIdByUuid))
    .sort((a, b) => a.rowIndex - b.rowIndex);
}

export async function saveColumnMapping(input: ColumnMapping): Promise<ColumnMapping> {
  const organizationId = await ensureDefaultOrganization();
  const importJob = await selectRowByLegacyId("import_jobs", organizationId, input.importJobId);
  if (!importJob) throw new Error(`Import job not found: ${input.importJobId}`);
  await upsertRows(
    "column_mappings",
    [
      {
        organization_id: organizationId,
        import_job_id: stringValue(importJob.id),
        company_name_column: input.companyNameColumn,
        country_column: input.countryColumn,
        product_description_column: input.productDescriptionColumn,
        transaction_summary_column: input.transactionSummaryColumn,
        source_keyword_column: input.sourceKeywordColumn,
        updated_at: now()
      }
    ],
    "import_job_id"
  );
  invalidateReadStoreCache();
  return input;
}

export async function getColumnMapping(importJobId: EntityId) {
  const organizationId = await ensureDefaultOrganization();
  const importJob = await selectRowByLegacyId("import_jobs", organizationId, importJobId);
  if (!importJob) return null;
  const rows = await selectRowsByColumn(
    "column_mappings",
    organizationId,
    "import_job_id",
    stringValue(importJob.id)
  );
  return rows[0] ? rowToColumnMapping(rows[0], reverseMap([importJob])) : null;
}

export async function getImportJobResults(importJobId: EntityId) {
  const cached = getCachedValue(cacheState.importJobResultsCache, importJobId);
  if (cached !== undefined) return cached;

  const organizationId = await ensureDefaultOrganization();
  const importJobRow = await selectRowByLegacyId("import_jobs", organizationId, importJobId);
  if (!importJobRow) {
    setCachedValue(cacheState.importJobResultsCache, importJobId, null);
    return null;
  }

  const importJobUuid = stringValue(importJobRow.id);
  const [runRows, rowRows, mappingRows, companyRows] = await Promise.all([
    selectRows("runs", organizationId),
    selectRowsByColumn("import_rows", organizationId, "import_job_id", importJobUuid),
    selectRowsByColumn("column_mappings", organizationId, "import_job_id", importJobUuid),
    selectRowsByColumn("companies", organizationId, "import_job_id", importJobUuid)
  ]);
  const runIdByUuid = reverseMap(runRows);
  const importJobIdByUuid = reverseMap([importJobRow]);
  const importJob = rowToImportJob(importJobRow, runIdByUuid);

  const results = {
    importJob,
    rows: rowRows
      .map((row) => rowToImportRow(row, importJobIdByUuid))
      .sort((a, b) => a.rowIndex - b.rowIndex),
    mapping: mappingRows[0] ? rowToColumnMapping(mappingRows[0], importJobIdByUuid) : null,
    companies: companyRows.map((row) => rowToCompany(row, runIdByUuid, importJobIdByUuid))
  };
  setCachedValue(cacheState.importJobResultsCache, importJobId, results);
  return results;
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
  const organizationId = await ensureDefaultOrganization();
  const timestamp = now();
  const log: SearchQueryLog = {
    id: createId("search_log"),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input
  };
  const [companyMap, importJobMap] = await Promise.all([
    legacyUuidMap("companies", organizationId, [log.companyId]),
    legacyUuidMap("import_jobs", organizationId, [log.importJobId])
  ]);

  await insertRows("search_query_logs", [
    {
      organization_id: organizationId,
      company_id: lookup(companyMap, log.companyId),
      import_job_id: lookup(importJobMap, log.importJobId),
      query: log.query,
      search_type: log.searchType,
      mode: log.mode,
      provider: log.provider,
      status: log.status,
      result_count: log.resultCount,
      average_confidence: log.averageConfidence,
      fallback_reason: log.fallbackReason,
      error_message: log.errorMessage,
      created_at: log.createdAt,
      updated_at: log.updatedAt
    }
  ]);
  invalidateReadStoreCache();
  return log;
}

export async function updateSearchProviderUsage(input: {
  provider: SearchProviderName;
  success: boolean;
  fallbackUsed?: boolean;
  errorMessage?: string;
}) {
  const organizationId = await ensureDefaultOrganization();
  const timestamp = now();
  const supabase = requireSupabase();
  const { data: existingRow, error: existingError } = await supabase
    .from("search_provider_usage")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", input.provider)
    .maybeSingle();
  if (existingError) throw new Error(`Supabase lookup search_provider_usage failed: ${existingError.message}`);
  const existing = existingRow ? rowToSearchProviderUsage(existingRow as Row) : undefined;
  const usage: SearchProviderUsage = {
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

  await upsertRows(
    "search_provider_usage",
    [
      {
        organization_id: organizationId,
        provider: usage.provider,
        total_queries: usage.totalQueries,
        successful_queries: usage.successfulQueries,
        failed_queries: usage.failedQueries,
        fallback_count: usage.fallbackCount,
        last_used_at: usage.lastUsedAt,
        last_error: usage.lastError,
        created_at: usage.createdAt,
        updated_at: usage.updatedAt
      }
    ],
    "organization_id,provider"
  );
  invalidateReadStoreCache();
  return usage;
}

export async function createRun(input: CreateRunInput): Promise<Run> {
  const organizationId = await ensureDefaultOrganization();
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
  const runRows = await upsertRows("runs", [
    {
      organization_id: organizationId,
      legacy_id: run.id,
      product_input: run.productInput,
      normalized_product: run.normalizedProduct,
      target_customer_count: run.targetCustomerCount,
      status: run.status,
      current_step: run.currentStep,
      keyword_review_status: run.keywordReviewStatus,
      email_review_status: run.emailReviewStatus,
      metadata: run.metadata ?? {},
      created_at: run.createdAt,
      updated_at: run.updatedAt
    }
  ]);
  const runUuid = stringValue(runRows[0].id);
  await upsertRows(
    "run_steps",
    createInitialRunSteps(run.id, createdAt).map((step) => ({
      organization_id: organizationId,
      run_id: runUuid,
      legacy_id: step.id,
      step_key: step.stepKey,
      step_order: step.order,
      label: step.label,
      status: step.status,
      summary: step.summary,
      input_snapshot: step.inputSnapshot,
      output_snapshot: step.outputSnapshot,
      error_message: step.errorMessage,
      started_at: step.startedAt,
      completed_at: step.completedAt,
      created_at: step.createdAt,
      updated_at: step.updatedAt
    }))
  );
  invalidateReadStoreCache();
  return rowToRun(runRows[0]);
}

export async function listRuns() {
  const organizationId = await ensureDefaultOrganization();
  const rows = await selectRows("runs", organizationId);
  return rows.map(rowToRun).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateRun(runId: EntityId, patch: Partial<Omit<Run, "id" | "createdAt">>) {
  const organizationId = await ensureDefaultOrganization();
  const existing = await selectRowByLegacyId("runs", organizationId, runId);
  if (!existing) throw new Error(`Run not found: ${runId}`);
  const metadata = patch.metadata
    ? { ...objectValue(existing.metadata), ...patch.metadata }
    : undefined;
  const updated = await updateRowById(
    "runs",
    stringValue(existing.id),
    compactRow({
      product_input: patch.productInput,
      normalized_product: patch.normalizedProduct,
      target_customer_count: patch.targetCustomerCount,
      status: patch.status,
      current_step: patch.currentStep,
      keyword_review_status: patch.keywordReviewStatus,
      email_review_status: patch.emailReviewStatus,
      metadata,
      updated_at: now()
    })
  );
  invalidateReadStoreCache();
  return rowToRun(updated);
}

export async function updateRunStep(
  runId: EntityId,
  stepKey: RunStep["stepKey"],
  patch: UpdateRunStepInput
): Promise<RunStep> {
  const organizationId = await ensureDefaultOrganization();
  const runRow = await selectRowByLegacyId("runs", organizationId, runId);
  if (!runRow) throw new Error(`Run not found: ${runId}`);
  const supabase = requireSupabase();
  const { data: existingRows, error } = await supabase
    .from("run_steps")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("run_id", stringValue(runRow.id))
    .eq("step_key", stepKey)
    .limit(1);
  if (error) throw new Error(`Supabase lookup run_steps failed: ${error.message}`);
  const runMap = reverseMap([runRow]);
  const existingStep = existingRows?.[0] ? rowToRunStep(existingRows[0] as Row, runMap) : undefined;
  const updatedAt = now();
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
    startedAt:
      patch.status === "running"
        ? patch.startedAt ?? step.startedAt ?? updatedAt
        : patch.startedAt ?? step.startedAt,
    completedAt:
      patch.status === "completed" || patch.status === "failed" || patch.status === "skipped"
        ? patch.completedAt ?? updatedAt
        : patch.completedAt ?? step.completedAt,
    updatedAt
  };

  const rows = await upsertRows("run_steps", [
    {
      organization_id: organizationId,
      run_id: stringValue(runRow.id),
      legacy_id: nextStep.id,
      step_key: nextStep.stepKey,
      step_order: nextStep.order,
      label: nextStep.label,
      status: nextStep.status,
      summary: nextStep.summary,
      input_snapshot: nextStep.inputSnapshot,
      output_snapshot: nextStep.outputSnapshot,
      error_message: nextStep.errorMessage,
      started_at: nextStep.startedAt,
      completed_at: nextStep.completedAt,
      created_at: nextStep.createdAt,
      updated_at: nextStep.updatedAt
    }
  ]);
  await updateRowById("runs", stringValue(runRow.id), {
    current_step: stepKey,
    status: statusFromStep(nextStep.status),
    updated_at: updatedAt
  });
  invalidateReadStoreCache();
  return rowToRunStep(rows[0], runMap);
}

export async function saveKeywords(runId: EntityId, input: SaveKeywordInput[]) {
  if (input.length === 0) return [];
  const organizationId = await ensureDefaultOrganization();
  const runMap = await legacyUuidMap("runs", organizationId, [runId]);
  const runUuid = lookup(runMap, runId);
  if (!runUuid) throw new Error(`Run not found: ${runId}`);
  const timestamp = now();
  const keywords: Keyword[] = input.map((keyword) => ({
    ...keyword,
    id: keyword.id ?? createId("keyword"),
    runId,
    evidenceIds: keyword.evidenceIds ?? [],
    createdAt: keyword.createdAt ?? timestamp,
    updatedAt: timestamp
  }));
  const rows = await upsertRows(
    "keywords",
    keywords.map((keyword) => ({
      organization_id: organizationId,
      run_id: runUuid,
      legacy_id: keyword.id,
      value: keyword.value,
      language: keyword.language,
      source: normalizeKeywordSource(keyword.source),
      status: keyword.status,
      confidence: keyword.confidence,
      reason: keyword.reason,
      evidence_ids: [],
      created_at: keyword.createdAt,
      updated_at: keyword.updatedAt
    }))
  );
  invalidateReadStoreCache();
  return rows.map((row) => rowToKeyword(row, runMap));
}

export async function saveCompanies(runId: EntityId, input: SaveCompanyInput[]) {
  if (input.length === 0) return [];
  const organizationId = await ensureDefaultOrganization();
  const runMap = await legacyUuidMap("runs", organizationId, [runId]);
  const importJobMap = await legacyUuidMap(
    "import_jobs",
    organizationId,
    input.map((company) => company.importJobId)
  );
  const runUuid = lookup(runMap, runId);
  if (!runUuid) throw new Error(`Run not found: ${runId}`);
  const timestamp = now();
  const companies = input.map<Company>((company) => ({
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
  const rows = await upsertRows(
    "companies",
    companies.map((company) => companyToRow(organizationId, company, runMap, importJobMap))
  );
  invalidateReadStoreCache();
  return rows.map((row) => rowToCompany(row, runMap, importJobMap));
}

export async function updateCompany(
  companyId: EntityId,
  patch: Partial<Omit<Company, "id" | "createdAt">>
) {
  const organizationId = await ensureDefaultOrganization();
  const existing = await selectRowByLegacyId("companies", organizationId, companyId);
  if (!existing) throw new Error(`Company not found: ${companyId}`);
  const [runMap, importJobMap, evidenceMap] = await Promise.all([
    legacyUuidMap("runs", organizationId, [patch.runId]),
    legacyUuidMap("import_jobs", organizationId, [patch.importJobId]),
    legacyUuidMap("evidence", organizationId, patch.evidenceIds)
  ]);
  const updated = await updateRowById(
    "companies",
    stringValue(existing.id),
    companyPatchToRow(patch, runMap, importJobMap, evidenceMap)
  );
  const [runIdByUuid, importJobIdByUuid] = await Promise.all([
    uuidLegacyMap("runs", organizationId, [stringValue(updated.run_id)]),
    uuidLegacyMap("import_jobs", organizationId, [stringValue(updated.import_job_id)])
  ]);
  invalidateReadStoreCache();
  return rowToCompany(updated, runIdByUuid, importJobIdByUuid);
}

export async function saveCompanyNote(input: SaveCompanyNoteInput): Promise<CompanyNote> {
  const organizationId = await ensureDefaultOrganization();
  const companyMap = await legacyUuidMap("companies", organizationId, [input.companyId]);
  const companyId = lookup(companyMap, input.companyId);
  if (!companyId) throw new Error(`Company not found: ${input.companyId}`);
  const timestamp = now();
  const note: CompanyNote = {
    ...input,
    id: input.id ?? createId("company_note"),
    content: input.content.trim(),
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp
  };
  const rows = await upsertRows("company_notes", [
    {
      organization_id: organizationId,
      company_id: companyId,
      legacy_id: note.id,
      content: note.content,
      created_at: note.createdAt,
      updated_at: note.updatedAt
    }
  ]);
  invalidateReadStoreCache();
  return rowToCompanyNote(rows[0], companyMap);
}

export async function listCompanyNotes(companyId: EntityId) {
  const db = await readStore();
  return db.companyNotes
    .filter((note) => note.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateCompaniesForRun(
  runId: EntityId,
  patcher: (company: Company) => Partial<Company>
) {
  const organizationId = await ensureDefaultOrganization();
  const runRow = await selectRowByLegacyId("runs", organizationId, runId);
  if (!runRow) throw new Error(`Run not found: ${runId}`);
  const companyRows = await selectRowsByColumn("companies", organizationId, "run_id", stringValue(runRow.id));
  const runMap = reverseMap([runRow]);
  const importJobMap = reverseMap(await selectRows("import_jobs", organizationId));
  const updatedAt = now();
  const companies = companyRows.map((row) => rowToCompany(row, runMap, importJobMap));
  const nextCompanies = companies.map<Company>((company) => ({
    ...company,
    ...patcher(company),
    updatedAt
  }));
  const rows = await upsertRows(
    "companies",
    nextCompanies.map((company) => companyToRow(organizationId, company, runMap, importJobMap))
  );
  invalidateReadStoreCache();
  return rows.map((row) => rowToCompany(row, runMap, importJobMap));
}

export async function saveContacts(runId: EntityId, input: SaveContactInput[]) {
  if (input.length === 0) return [];
  const organizationId = await ensureDefaultOrganization();
  const timestamp = now();
  const contacts: Contact[] = input.map((contact) => ({
    ...contact,
    id: contact.id ?? createId("contact"),
    runId,
    evidenceIds: contact.evidenceIds ?? [],
    createdAt: contact.createdAt ?? timestamp,
    updatedAt: timestamp
  }));
  const [runMap, companyMap] = await Promise.all([
    legacyUuidMap("runs", organizationId, [runId]),
    legacyUuidMap("companies", organizationId, contacts.map((contact) => contact.companyId))
  ]);
  const rows = await upsertRows(
    "contacts",
    contacts.flatMap((contact) => {
      const companyId = lookup(companyMap, contact.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, contact.runId),
        company_id: companyId,
        legacy_id: contact.id,
        full_name: contact.fullName,
        title: contact.title,
        department: contact.department,
        source: contact.source,
        confidence: contact.confidence,
        evidence_ids: [],
        created_at: contact.createdAt,
        updated_at: contact.updatedAt
      }];
    })
  );
  invalidateReadStoreCache();
  return rows.map((row) => rowToContact(row, runMap, companyMap));
}

export async function saveEmailAddresses(runId: EntityId, input: SaveEmailAddressInput[]) {
  if (input.length === 0) return [];
  const organizationId = await ensureDefaultOrganization();
  const timestamp = now();
  const emailAddresses: EmailAddress[] = input.map((emailAddress) => ({
    ...emailAddress,
    id: emailAddress.id ?? createId("email"),
    runId,
    evidenceIds: emailAddress.evidenceIds ?? [],
    createdAt: emailAddress.createdAt ?? timestamp,
    updatedAt: timestamp
  }));
  const [runMap, companyMap, contactMap, evidenceMap] = await Promise.all([
    legacyUuidMap("runs", organizationId, [runId]),
    legacyUuidMap("companies", organizationId, emailAddresses.map((email) => email.companyId)),
    legacyUuidMap("contacts", organizationId, emailAddresses.map((email) => email.contactId)),
    legacyUuidMap("evidence", organizationId, emailAddresses.flatMap((email) => email.evidenceIds))
  ]);
  const rows = await upsertRows(
    "company_emails",
    emailAddresses.flatMap((email) => {
      const companyId = lookup(companyMap, email.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, email.runId),
        company_id: companyId,
        contact_id: lookup(contactMap, email.contactId),
        legacy_id: email.id,
        email: email.email,
        domain: email.domain,
        source: email.source,
        confidence: email.confidence,
        verification_status: email.verificationStatus,
        evidence_ids: mapIds(evidenceMap, email.evidenceIds),
        created_at: email.createdAt,
        updated_at: email.updatedAt
      }];
    })
  );
  invalidateReadStoreCache();
  return rows.map((row) => rowToEmailAddress(row, runMap, companyMap, contactMap));
}

export async function saveWhatsappNumbers(runId: EntityId, input: SaveWhatsappNumberInput[]) {
  if (input.length === 0) return [];
  const organizationId = await ensureDefaultOrganization();
  const timestamp = now();
  const whatsappNumbers: WhatsappNumber[] = input.map((whatsappNumber) => ({
    ...whatsappNumber,
    id: whatsappNumber.id ?? createId("whatsapp"),
    runId,
    evidenceIds: whatsappNumber.evidenceIds ?? [],
    createdAt: whatsappNumber.createdAt ?? timestamp,
    updatedAt: timestamp
  }));
  const rows = await upsertPhoneRows(organizationId, whatsappNumbers, "whatsapp");
  const [runMap, companyMap, contactMap] = await Promise.all([
    legacyUuidMap("runs", organizationId, [runId]),
    legacyUuidMap("companies", organizationId, whatsappNumbers.map((phone) => phone.companyId)),
    legacyUuidMap("contacts", organizationId, whatsappNumbers.map((phone) => phone.contactId))
  ]);
  invalidateReadStoreCache();
  return rows.map((row) => rowToWhatsappNumber(row, runMap, companyMap, contactMap));
}

export async function savePhoneNumbers(runId: EntityId, input: SavePhoneNumberInput[]) {
  if (input.length === 0) return [];
  const organizationId = await ensureDefaultOrganization();
  const timestamp = now();
  const phoneNumbers: PhoneNumber[] = input.map((phoneNumber) => ({
    ...phoneNumber,
    id: phoneNumber.id ?? createId("phone"),
    runId,
    evidenceIds: phoneNumber.evidenceIds ?? [],
    createdAt: phoneNumber.createdAt ?? timestamp,
    updatedAt: timestamp
  }));
  const rows = await upsertPhoneRows(organizationId, phoneNumbers, "phone");
  const [runMap, companyMap, contactMap] = await Promise.all([
    legacyUuidMap("runs", organizationId, [runId]),
    legacyUuidMap("companies", organizationId, phoneNumbers.map((phone) => phone.companyId)),
    legacyUuidMap("contacts", organizationId, phoneNumbers.map((phone) => phone.contactId))
  ]);
  invalidateReadStoreCache();
  return rows.map((row) => rowToPhoneNumber(row, runMap, companyMap, contactMap));
}

export async function saveEvidence(runId: EntityId, input: SaveEvidenceInput[]) {
  if (input.length === 0) return [];
  const organizationId = await ensureDefaultOrganization();
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
  const [runMap, companyMap, contactMap] = await Promise.all([
    legacyUuidMap("runs", organizationId, [runId]),
    legacyUuidMap("companies", organizationId, evidence.map((item) => item.companyId)),
    legacyUuidMap("contacts", organizationId, evidence.map((item) => item.contactId))
  ]);
  const rows = await upsertRows(
    "evidence",
    evidence.map((item) => ({
      organization_id: organizationId,
      run_id: lookup(runMap, item.runId),
      company_id: lookup(companyMap, item.companyId),
      contact_id: lookup(contactMap, item.contactId),
      legacy_id: item.id,
      provider: item.provider,
      source_provider: item.sourceProvider,
      type: item.type,
      source: item.source,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      raw_text: item.rawText,
      confidence: item.confidence,
      raw_json: item.rawJson ?? item.raw,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    }))
  );
  invalidateReadStoreCache();
  return rows.map((row) => rowToEvidence(row, runMap, companyMap, contactMap));
}

export async function saveEmailDrafts(runId: EntityId, input: SaveEmailDraftInput[]) {
  if (input.length === 0) return [];
  const organizationId = await ensureDefaultOrganization();
  const timestamp = now();
  const emailDrafts: EmailDraft[] = input.map((draft) => ({
    ...draft,
    id: draft.id ?? createId("email_draft"),
    runId,
    status: draft.status ?? "draft",
    provider: draft.provider ?? "mock",
    personalizationNotes: draft.personalizationNotes ?? [],
    usedEvidenceIds: draft.usedEvidenceIds ?? draft.evidenceIds ?? [],
    styleNotes: draft.styleNotes ?? [],
    evidenceIds: draft.evidenceIds ?? [],
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp
  }));
  const [runMap, companyMap, contactMap, emailMap, evidenceMap] = await Promise.all([
    legacyUuidMap("runs", organizationId, [runId]),
    legacyUuidMap("companies", organizationId, emailDrafts.map((draft) => draft.companyId)),
    legacyUuidMap("contacts", organizationId, emailDrafts.map((draft) => draft.contactId)),
    legacyUuidMap("company_emails", organizationId, emailDrafts.map((draft) => draft.toEmailAddressId)),
    legacyUuidMap("evidence", organizationId, emailDrafts.flatMap((draft) => draft.usedEvidenceIds ?? []))
  ]);
  const rows = await upsertRows(
    "email_drafts",
    emailDrafts.flatMap((draft) => {
      const companyId = lookup(companyMap, draft.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, draft.runId),
        company_id: companyId,
        contact_id: lookup(contactMap, draft.contactId),
        to_email_address_id: lookup(emailMap, draft.toEmailAddressId),
        legacy_id: draft.id,
        to_email: draft.toEmail,
        subject: draft.subject,
        body: draft.body,
        status: draft.status,
        used_evidence_ids: mapIds(evidenceMap, draft.usedEvidenceIds ?? []),
        style_notes: draft.styleNotes ?? [],
        approved_at: draft.approvedAt,
        skipped_at: draft.skippedAt,
        sent_at: draft.sentAt,
        edited_at: draft.editedAt,
        error_message: draft.errorMessage,
        provider: draft.provider,
        personalization_notes: draft.personalizationNotes ?? [],
        evidence_ids: mapIds(evidenceMap, draft.evidenceIds ?? []),
        created_at: draft.createdAt,
        updated_at: draft.updatedAt
      }];
    })
  );
  invalidateReadStoreCache();
  return rows.map((row) => rowToEmailDraft(row, runMap, companyMap, contactMap, emailMap));
}

export async function updateEmailDraft(
  draftId: EntityId,
  patch: Partial<Omit<EmailDraft, "id" | "runId" | "createdAt">>
) {
  const organizationId = await ensureDefaultOrganization();
  const existing = await selectRowByLegacyId("email_drafts", organizationId, draftId);
  if (!existing) throw new Error(`Email draft not found: ${draftId}`);
  const [companyMap, contactMap, emailMap, evidenceMap] = await Promise.all([
    legacyUuidMap("companies", organizationId, [patch.companyId]),
    legacyUuidMap("contacts", organizationId, [patch.contactId]),
    legacyUuidMap("company_emails", organizationId, [patch.toEmailAddressId]),
    legacyUuidMap("evidence", organizationId, [
      ...(patch.usedEvidenceIds ?? []),
      ...(patch.evidenceIds ?? [])
    ])
  ]);
  const updated = await updateRowById(
    "email_drafts",
    stringValue(existing.id),
    compactRow({
      company_id: patch.companyId ? lookup(companyMap, patch.companyId) : undefined,
      contact_id: patch.contactId ? lookup(contactMap, patch.contactId) : undefined,
      to_email_address_id: patch.toEmailAddressId ? lookup(emailMap, patch.toEmailAddressId) : undefined,
      to_email: patch.toEmail,
      subject: patch.subject,
      body: patch.body,
      status: patch.status,
      used_evidence_ids: patch.usedEvidenceIds ? mapIds(evidenceMap, patch.usedEvidenceIds) : undefined,
      style_notes: patch.styleNotes,
      approved_at: patch.approvedAt,
      skipped_at: patch.skippedAt,
      sent_at: patch.sentAt,
      edited_at: patch.editedAt,
      error_message: patch.errorMessage,
      provider: patch.provider,
      personalization_notes: patch.personalizationNotes,
      evidence_ids: patch.evidenceIds ? mapIds(evidenceMap, patch.evidenceIds) : undefined,
      updated_at: now()
    })
  );
  const [runIdByUuid, companyIdByUuid, contactIdByUuid, emailIdByUuid] = await Promise.all([
    uuidLegacyMap("runs", organizationId, [stringValue(updated.run_id)]),
    uuidLegacyMap("companies", organizationId, [stringValue(updated.company_id)]),
    uuidLegacyMap("contacts", organizationId, [stringValue(updated.contact_id)]),
    uuidLegacyMap("company_emails", organizationId, [stringValue(updated.to_email_address_id)])
  ]);
  invalidateReadStoreCache();
  return rowToEmailDraft(updated, runIdByUuid, companyIdByUuid, contactIdByUuid, emailIdByUuid);
}

export async function updateEmailDraftsForRun(
  runId: EntityId,
  patcher: (draft: EmailDraft) => Partial<EmailDraft>
) {
  const organizationId = await ensureDefaultOrganization();
  const runRow = await selectRowByLegacyId("runs", organizationId, runId);
  if (!runRow) throw new Error(`Run not found: ${runId}`);
  const draftRows = await selectRowsByColumn("email_drafts", organizationId, "run_id", stringValue(runRow.id));
  const [companyRows, contactRows, emailRows] = await Promise.all([
    selectRows("companies", organizationId),
    selectRows("contacts", organizationId),
    selectRows("company_emails", organizationId)
  ]);
  const runMap = reverseMap([runRow]);
  const companyMap = reverseMap(companyRows);
  const contactMap = reverseMap(contactRows);
  const emailMap = reverseMap(emailRows);
  const drafts = draftRows.map((row) => rowToEmailDraft(row, runMap, companyMap, contactMap, emailMap));
  const timestamp = now();
  const nextDrafts = drafts.map<EmailDraft>((draft) => ({
    ...draft,
    ...patcher(draft),
    updatedAt: timestamp
  }));
  const evidenceMap = await legacyUuidMap(
    "evidence",
    organizationId,
    nextDrafts.flatMap((draft) => [...(draft.usedEvidenceIds ?? []), ...(draft.evidenceIds ?? [])])
  );
  const rows = await upsertRows(
    "email_drafts",
    nextDrafts.flatMap((draft) => {
      const companyId = lookup(companyMap, draft.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: stringValue(runRow.id),
        company_id: companyId,
        contact_id: lookup(contactMap, draft.contactId),
        to_email_address_id: lookup(emailMap, draft.toEmailAddressId),
        legacy_id: draft.id,
        to_email: draft.toEmail,
        subject: draft.subject,
        body: draft.body,
        status: draft.status,
        used_evidence_ids: mapIds(evidenceMap, draft.usedEvidenceIds ?? []),
        style_notes: draft.styleNotes ?? [],
        approved_at: draft.approvedAt,
        skipped_at: draft.skippedAt,
        sent_at: draft.sentAt,
        edited_at: draft.editedAt,
        error_message: draft.errorMessage,
        provider: draft.provider,
        personalization_notes: draft.personalizationNotes ?? [],
        evidence_ids: mapIds(evidenceMap, draft.evidenceIds ?? []),
        created_at: draft.createdAt,
        updated_at: draft.updatedAt
      }];
    })
  );
  invalidateReadStoreCache();
  return rows.map((row) => rowToEmailDraft(row, runMap, companyMap, contactMap, emailMap));
}

export async function saveEmailLogs(runId: EntityId, input: SaveEmailLogInput[]) {
  if (input.length === 0) return [];
  const organizationId = await ensureDefaultOrganization();
  const timestamp = now();
  const emailLogs: EmailLog[] = input.map((log) => ({
    ...log,
    id: log.id ?? createId("email_log"),
    runId,
    createdAt: log.createdAt ?? timestamp,
    updatedAt: timestamp
  }));
  const [runMap, companyMap, draftMap] = await Promise.all([
    legacyUuidMap("runs", organizationId, [runId]),
    legacyUuidMap("companies", organizationId, emailLogs.map((log) => log.companyId)),
    legacyUuidMap("email_drafts", organizationId, emailLogs.map((log) => log.emailDraftId))
  ]);
  const rows = await upsertRows(
    "email_logs",
    emailLogs.flatMap((log) => {
      const companyId = lookup(companyMap, log.companyId);
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, log.runId),
        email_draft_id: lookup(draftMap, log.emailDraftId),
        company_id: companyId,
        legacy_id: log.id,
        provider: log.provider,
        action: log.action ?? "send",
        status: log.status,
        to_email: log.toEmail,
        from_email: log.fromEmail,
        subject: log.subject,
        provider_message_id: log.providerMessageId,
        error_message: log.errorMessage,
        attempted_at: log.attemptedAt ?? log.createdAt,
        created_at: log.createdAt,
        updated_at: log.updatedAt
      }];
    })
  );
  invalidateReadStoreCache();
  return rows.map((row) => rowToEmailLog(row, runMap, companyMap, draftMap));
}

export async function saveAuditLogs(input: SaveAuditLogInput[]) {
  const timestamp = now();
  const auditLogs: AuditLog[] = input.map((log) => ({
    ...log,
    id: log.id ?? createId("audit_log"),
    createdAt: log.createdAt ?? timestamp,
    updatedAt: timestamp
  }));

  if (isOptionalTableTemporarilyMissing("audit_logs")) return auditLogs;

  const organizationId = await ensureDefaultOrganization();

  await insertRowsIfExists(
    "audit_logs",
    auditLogs.map((log) => ({
      organization_id: organizationId,
      legacy_id: log.id,
      actor_type: log.actorType,
      actor_id: log.actorId,
      action: log.action,
      resource_type: log.resourceType,
      resource_legacy_id: log.resourceId,
      status: log.status,
      ip_address: log.ipAddress,
      user_agent: log.userAgent,
      request_id: log.requestId,
      metadata: log.metadata ?? {},
      error_message: log.errorMessage,
      created_at: log.createdAt,
      updated_at: log.updatedAt
    }))
  );

  return auditLogs;
}

export async function listAuditLogs(limit = 100) {
  const organizationId = await ensureDefaultOrganization();
  const rows = await selectRowsIfExists("audit_logs", organizationId);
  return rows
    .map((row) => rowToAuditLog(row, new Map(), new Map(), new Map()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(500, limit)));
}

export async function getRunResults(runId: EntityId): Promise<RunResults | null> {
  const cached = getCachedValue(cacheState.runResultsCache, runId);
  if (cached !== undefined) return cached;

  const organizationId = await ensureDefaultOrganization();
  const runRow = await selectRowByLegacyId("runs", organizationId, runId);
  if (!runRow) {
    setCachedValue(cacheState.runResultsCache, runId, null);
    return null;
  }

  const runUuid = stringValue(runRow.id);
  const [
    runSteps,
    keywords,
    companies,
    contacts,
    emailRows,
    phoneRows,
    evidence,
    emailDrafts,
    emailLogs
  ] = await Promise.all([
    selectRowsByColumn("run_steps", organizationId, "run_id", runUuid),
    selectRowsByColumn("keywords", organizationId, "run_id", runUuid),
    selectRowsByColumn("companies", organizationId, "run_id", runUuid),
    selectRowsByColumn("contacts", organizationId, "run_id", runUuid),
    selectRowsByColumn("company_emails", organizationId, "run_id", runUuid),
    selectRowsByColumn("company_phones", organizationId, "run_id", runUuid),
    selectRowsByColumn("evidence", organizationId, "run_id", runUuid),
    selectRowsByColumn("email_drafts", organizationId, "run_id", runUuid),
    selectRowsByColumn("email_logs", organizationId, "run_id", runUuid)
  ]);
  const runIdByUuid = reverseMap([runRow]);
  const importJobIdByUuid = reverseMap(await selectRows("import_jobs", organizationId));
  const companyIdByUuid = reverseMap(companies);
  const contactIdByUuid = reverseMap(contacts);
  const emailIdByUuid = reverseMap(emailRows);
  const draftIdByUuid = reverseMap(emailDrafts);

  const results: RunResults = {
    run: rowToRun(runRow),
    runSteps: runSteps
      .map((step) => rowToRunStep(step, runIdByUuid))
      .sort((a, b) => a.order - b.order),
    keywords: keywords.map((keyword) => rowToKeyword(keyword, runIdByUuid)),
    companies: companies.map((company) => rowToCompany(company, runIdByUuid, importJobIdByUuid)),
    contacts: contacts.map((contact) => rowToContact(contact, runIdByUuid, companyIdByUuid)),
    emailAddresses: emailRows.map((email) =>
      rowToEmailAddress(email, runIdByUuid, companyIdByUuid, contactIdByUuid)
    ),
    whatsappNumbers: phoneRows
      .filter((row) => row.phone_type === "whatsapp")
      .map((row) => rowToWhatsappNumber(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    phoneNumbers: phoneRows
      .filter((row) => row.phone_type !== "whatsapp")
      .map((row) => rowToPhoneNumber(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    evidence: evidence.map((row) => rowToEvidence(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    emailDrafts: emailDrafts.map((draft) =>
      rowToEmailDraft(draft, runIdByUuid, companyIdByUuid, contactIdByUuid, emailIdByUuid)
    ),
    emailLogs: emailLogs.map((log) => rowToEmailLog(log, runIdByUuid, companyIdByUuid, draftIdByUuid))
  };
  setCachedValue(cacheState.runResultsCache, runId, results);
  return results;
}

export async function listCompanies() {
  const organizationId = await ensureDefaultOrganization();
  const [companies, runs, importJobs] = await Promise.all([
    selectRows("companies", organizationId),
    selectRows("runs", organizationId),
    selectRows("import_jobs", organizationId)
  ]);
  const runIdByUuid = reverseMap(runs);
  const importJobIdByUuid = reverseMap(importJobs);
  return companies
    .map((row) => rowToCompany(row, runIdByUuid, importJobIdByUuid))
    .sort((a, b) => (b.buyerFitScore ?? 0) - (a.buyerFitScore ?? 0));
}

export async function listEmailDrafts() {
  const organizationId = await ensureDefaultOrganization();
  const [drafts, runs, companies, contacts, emails] = await Promise.all([
    selectRows("email_drafts", organizationId),
    selectRows("runs", organizationId),
    selectRows("companies", organizationId),
    selectRows("contacts", organizationId),
    selectRows("company_emails", organizationId)
  ]);
  const runIdByUuid = reverseMap(runs);
  const companyIdByUuid = reverseMap(companies);
  const contactIdByUuid = reverseMap(contacts);
  const emailIdByUuid = reverseMap(emails);
  return drafts
    .map((row) => rowToEmailDraft(row, runIdByUuid, companyIdByUuid, contactIdByUuid, emailIdByUuid))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEmailDraft(draftId: EntityId) {
  const organizationId = await ensureDefaultOrganization();
  const draft = await selectRowByLegacyId("email_drafts", organizationId, draftId);
  if (!draft) return null;
  const [runs, companies, contacts, emails] = await Promise.all([
    selectRows("runs", organizationId),
    selectRows("companies", organizationId),
    selectRows("contacts", organizationId),
    selectRows("company_emails", organizationId)
  ]);
  return rowToEmailDraft(
    draft,
    reverseMap(runs),
    reverseMap(companies),
    reverseMap(contacts),
    reverseMap(emails)
  );
}

export async function getCompanyResults(companyId: EntityId): Promise<CompanyResults | null> {
  const cached = getCachedValue(cacheState.companyResultsCache, companyId);
  if (cached !== undefined) return cached;

  const organizationId = await ensureDefaultOrganization();
  const companyRow = await selectRowByLegacyId("companies", organizationId, companyId);
  if (!companyRow) {
    setCachedValue(cacheState.companyResultsCache, companyId, null);
    return null;
  }

  const companyUuid = stringValue(companyRow.id);
  const [
    runs,
    importJobs,
    contacts,
    emailRows,
    phoneRows,
    evidence,
    emailDrafts,
    companyNotes,
    emailLogs
  ] = await Promise.all([
    selectRows("runs", organizationId),
    selectRows("import_jobs", organizationId),
    selectRowsByColumn("contacts", organizationId, "company_id", companyUuid),
    selectRowsByColumn("company_emails", organizationId, "company_id", companyUuid),
    selectRowsByColumn("company_phones", organizationId, "company_id", companyUuid),
    selectRowsByColumn("evidence", organizationId, "company_id", companyUuid),
    selectRowsByColumn("email_drafts", organizationId, "company_id", companyUuid),
    selectRowsByColumn("company_notes", organizationId, "company_id", companyUuid),
    selectRowsByColumn("email_logs", organizationId, "company_id", companyUuid)
  ]);
  const runIdByUuid = reverseMap(runs);
  const importJobIdByUuid = reverseMap(importJobs);
  const companyIdByUuid = reverseMap([companyRow]);
  const contactIdByUuid = reverseMap(contacts);
  const emailIdByUuid = reverseMap(emailRows);
  const draftIdByUuid = reverseMap(emailDrafts);

  const results: CompanyResults = {
    company: rowToCompany(companyRow, runIdByUuid, importJobIdByUuid),
    contacts: contacts.map((contact) => rowToContact(contact, runIdByUuid, companyIdByUuid)),
    emailAddresses: emailRows.map((email) =>
      rowToEmailAddress(email, runIdByUuid, companyIdByUuid, contactIdByUuid)
    ),
    whatsappNumbers: phoneRows
      .filter((row) => row.phone_type === "whatsapp")
      .map((row) => rowToWhatsappNumber(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    phoneNumbers: phoneRows
      .filter((row) => row.phone_type !== "whatsapp")
      .map((row) => rowToPhoneNumber(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    evidence: evidence.map((row) => rowToEvidence(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    emailDrafts: emailDrafts.map((draft) =>
      rowToEmailDraft(draft, runIdByUuid, companyIdByUuid, contactIdByUuid, emailIdByUuid)
    ),
    companyNotes: companyNotes
      .map((note) => rowToCompanyNote(note, companyIdByUuid))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    emailLogs: emailLogs.map((log) => rowToEmailLog(log, runIdByUuid, companyIdByUuid, draftIdByUuid))
  };
  setCachedValue(cacheState.companyResultsCache, companyId, results);
  return results;
}

export async function readCrmStore(): Promise<LocalJsonDatabase> {
  const cached = getCachedSnapshot(cacheState.crmStoreCache);
  if (cached) return cached;

  const organizationId = await ensureDefaultOrganization();
  const [
    runs,
    companies,
    emailRows,
    phoneRows,
    evidence,
    emailDrafts,
    companyNotes
  ] = await Promise.all([
    selectRows("runs", organizationId),
    selectRows("companies", organizationId),
    selectRows("company_emails", organizationId),
    selectRows("company_phones", organizationId),
    selectEvidenceListRows(organizationId),
    selectRows("email_drafts", organizationId),
    selectRows("company_notes", organizationId)
  ]);
  const companyIdByUuid = reverseMap(companies);
  const runIdByUuid = reverseMap(runs);
  const contactIdByUuid = new Map<string, string>();
  const emailIdByUuid = reverseMap(emailRows);

  const db: LocalJsonDatabase = {
    ...createEmptyDatabase(),
    runs: runs.map(rowToRun),
    companies: companies.map((row) => rowToCompany(row, runIdByUuid, new Map())),
    emailAddresses: emailRows.map((row) =>
      rowToEmailAddress(row, runIdByUuid, companyIdByUuid, contactIdByUuid)
    ),
    whatsappNumbers: phoneRows
      .filter((row) => row.phone_type === "whatsapp")
      .map((row) => rowToWhatsappNumber(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    phoneNumbers: phoneRows
      .filter((row) => row.phone_type !== "whatsapp")
      .map((row) => rowToPhoneNumber(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    evidence: evidence.map((row) => rowToEvidence(row, runIdByUuid, companyIdByUuid, contactIdByUuid)),
    emailDrafts: emailDrafts.map((row) =>
      rowToEmailDraft(row, runIdByUuid, companyIdByUuid, contactIdByUuid, emailIdByUuid)
    ),
    companyNotes: companyNotes.map((row) => rowToCompanyNote(row, companyIdByUuid)),
    updatedAt: now()
  };
  cacheState.crmStoreCache = setSnapshotCache(db);
  return db;
}

export async function readReviewStore(): Promise<LocalJsonDatabase> {
  const cached = getCachedSnapshot(cacheState.reviewStoreCache);
  if (cached) return cached;

  const organizationId = await ensureDefaultOrganization();
  const [runs, runSteps, keywords, companies, emailDrafts] = await Promise.all([
    selectRows("runs", organizationId),
    selectRows("run_steps", organizationId),
    selectRows("keywords", organizationId),
    selectRows("companies", organizationId),
    selectRows("email_drafts", organizationId)
  ]);
  const runIdByUuid = reverseMap(runs);
  const companyIdByUuid = reverseMap(companies);

  const db: LocalJsonDatabase = {
    ...createEmptyDatabase(),
    runs: runs.map(rowToRun),
    runSteps: runSteps
      .map((row) => rowToRunStep(row, runIdByUuid))
      .sort((a, b) => a.order - b.order),
    keywords: keywords.map((row) => rowToKeyword(row, runIdByUuid)),
    companies: companies.map((row) => rowToCompany(row, runIdByUuid, new Map())),
    emailDrafts: emailDrafts.map((row) =>
      rowToEmailDraft(row, runIdByUuid, companyIdByUuid, new Map(), new Map())
    ),
    updatedAt: now()
  };
  cacheState.reviewStoreCache = setSnapshotCache(db);
  return db;
}

export async function testSupabaseStoreConnection() {
  const status = dataStoreStatus();

  if (status.activeProvider !== "supabase") {
    return {
      ok: true,
      provider: "local" as const,
      message: "Supabase is not configured. Using local store.",
      status
    };
  }

  const supabase = createSupabaseAdminClient();
  const config = supabaseAdminConfig();

  if (!supabase) {
    return {
      ok: true,
      provider: "local" as const,
      message: "Supabase admin client is not configured. Using local store.",
      status
    };
  }

  const { error: databaseError } = await supabase.from("organizations").select("id").limit(1);
  const { data: bucket, error: storageError } = await supabase.storage.getBucket(config.importsBucket);

  return {
    ok: !databaseError,
    provider: "supabase" as const,
    databaseConnected: !databaseError,
    storageBucket: config.importsBucket,
    storageBucketExists: Boolean(bucket && !storageError),
    error: databaseError?.message,
    storageError: storageError?.message,
    status
  };
}

export function supabaseStoreStatus() {
  return dataStoreStatus();
}

function getCachedStore() {
  const cacheMs = readStoreCacheMs();
  if (cacheMs <= 0 || !cacheState.readStoreCache) return null;
  if (cacheState.readStoreCache.expiresAt <= Date.now()) {
    cacheState.readStoreCache = null;
    return null;
  }
  return cacheState.readStoreCache.db;
}

function setCachedStore(db: LocalJsonDatabase) {
  const cacheMs = readStoreCacheMs();
  if (cacheMs <= 0) {
    cacheState.readStoreCache = null;
    return;
  }
  cacheState.readStoreCache = {
    db,
    expiresAt: Date.now() + cacheMs
  };
}

function invalidateReadStoreCache() {
  cacheState.readStoreCache = null;
  cacheState.crmStoreCache = null;
  cacheState.reviewStoreCache = null;
  cacheState.importJobResultsCache.clear();
  cacheState.runResultsCache.clear();
  cacheState.companyResultsCache.clear();
}

function getCachedSnapshot(cache: { db: LocalJsonDatabase; expiresAt: number } | null) {
  if (!cache || cache.expiresAt <= Date.now()) return null;
  return cache.db;
}

function setSnapshotCache(db: LocalJsonDatabase) {
  const cacheMs = pageStoreCacheMs();
  if (cacheMs <= 0) return null;
  return {
    db,
    expiresAt: Date.now() + cacheMs
  };
}

function getCachedValue<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string) {
  const item = cache.get(key);
  if (!item) return undefined;
  if (item.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return item.value;
}

function setCachedValue<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string, value: T) {
  const cacheMs = pageStoreCacheMs();
  if (cacheMs <= 0) return;
  cache.set(key, {
    value,
    expiresAt: Date.now() + cacheMs
  });
}

async function selectRows(table: string, organizationId: string): Promise<Row[]> {
  const supabase = requireSupabase();
  const pageSize = 1000;
  const rows: Row[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("organization_id", organizationId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Supabase select ${table} failed: ${error.message}`);

    const page = (data ?? []) as Row[];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

async function selectRowsByColumn(
  table: string,
  organizationId: string,
  column: string,
  value: string
): Promise<Row[]> {
  const supabase = requireSupabase();
  const pageSize = 1000;
  const rows: Row[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("organization_id", organizationId)
      .eq(column, value)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Supabase select ${table} by ${column} failed: ${error.message}`);

    const page = (data ?? []) as Row[];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

async function selectRowByLegacyId(table: string, organizationId: string, legacyIdValue: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("legacy_id", legacyIdValue)
    .maybeSingle();

  if (error) throw new Error(`Supabase lookup ${table} failed: ${error.message}`);
  return (data ?? null) as Row | null;
}

async function selectEvidenceListRows(organizationId: string): Promise<Row[]> {
  const supabase = requireSupabase();
  const pageSize = 1000;
  const rows: Row[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("evidence")
      .select("id,legacy_id,organization_id,run_id,company_id,contact_id,provider,type,created_at,updated_at")
      .eq("organization_id", organizationId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Supabase select evidence list failed: ${error.message}`);

    const page = (data ?? []) as Row[];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}

async function selectRowsIfExists(table: string, organizationId: string): Promise<Row[]> {
  if (isOptionalTableTemporarilyMissing(table)) return [];
  try {
    return await selectRows(table, organizationId);
  } catch (error) {
    if (optionalTables.has(table) && isMissingRelationError(error)) {
      markOptionalTableMissing(table);
      return [];
    }
    throw error;
  }
}

async function ensureDefaultOrganization() {
  const supabase = requireSupabase();
  const { data: existing, error: selectError } = await supabase
    .from("organizations")
    .select("id")
    .eq("legacy_id", defaultOrganizationLegacyId)
    .maybeSingle();

  if (selectError) throw new Error(`Supabase organization lookup failed: ${selectError.message}`);
  if (existing?.id) return String(existing.id);

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      legacy_id: defaultOrganizationLegacyId,
      name: defaultOrganizationName
    })
    .select("id")
    .single();

  if (error) throw new Error(`Supabase organization create failed: ${error.message}`);
  return String(data.id);
}

async function deleteOrganizationRows(table: string, organizationId: string) {
  const supabase = requireSupabase();
  const { error } = await supabase.from(table).delete().eq("organization_id", organizationId);
  if (error) throw new Error(`Supabase delete ${table} failed: ${error.message}`);
}

async function deleteOrganizationRowsIfExists(table: string, organizationId: string) {
  if (isOptionalTableTemporarilyMissing(table)) return;
  try {
    await deleteOrganizationRows(table, organizationId);
  } catch (error) {
    if (optionalTables.has(table) && isMissingRelationError(error)) {
      markOptionalTableMissing(table);
      return;
    }
    throw error;
  }
}

async function insertRows(table: string, rows: Row[]) {
  if (rows.length === 0) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase.from(table).insert(rows.map(sanitizeForPostgres)).select("*");
  if (error) throw new Error(`Supabase insert ${table} failed: ${error.message}`);
  return (data ?? []) as Row[];
}

async function upsertRows(table: string, rows: Row[], onConflict = "legacy_id") {
  if (rows.length === 0) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(table)
    .upsert(rows.map(sanitizeForPostgres), { onConflict })
    .select("*");
  if (error) throw new Error(`Supabase upsert ${table} failed: ${error.message}`);
  return (data ?? []) as Row[];
}

async function updateRowById(table: string, id: string, patch: Row) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(table)
    .update(sanitizeForPostgres(compactRow(patch)))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`Supabase update ${table} failed: ${error.message}`);
  return data as Row;
}

async function legacyUuidMap(table: string, organizationId: string, legacyIds: Array<string | undefined> | undefined): Promise<IdMap> {
  const ids = Array.from(new Set((legacyIds ?? []).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(table)
    .select("id,legacy_id")
    .eq("organization_id", organizationId)
    .in("legacy_id", ids);
  if (error) throw new Error(`Supabase lookup ${table} legacy ids failed: ${error.message}`);
  return mapInserted((data ?? []) as Row[]);
}

async function uuidLegacyMap(table: string, organizationId: string, ids: Array<string | undefined> | undefined): Promise<IdMap> {
  const uuids = Array.from(new Set((ids ?? []).filter((id): id is string => Boolean(id))));
  if (uuids.length === 0) return new Map();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(table)
    .select("id,legacy_id")
    .eq("organization_id", organizationId)
    .in("id", uuids);
  if (error) throw new Error(`Supabase lookup ${table} ids failed: ${error.message}`);
  return reverseMap((data ?? []) as Row[]);
}

function compactRow(row: Row) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined)
  ) as Row;
}

async function insertRowsIfExists(table: string, rows: Row[]) {
  if (isOptionalTableTemporarilyMissing(table)) return [];
  try {
    const inserted = await insertRows(table, rows);
    missingOptionalTableUntil.delete(table);
    return inserted;
  } catch (error) {
    if (optionalTables.has(table) && isMissingRelationError(error)) {
      markOptionalTableMissing(table);
      return [];
    }
    throw error;
  }
}

async function insertRuns(organizationId: string, runs: Run[]) {
  const rows = await insertRows(
    "runs",
    runs.map((run) => ({
      organization_id: organizationId,
      legacy_id: run.id,
      product_input: run.productInput,
      normalized_product: run.normalizedProduct,
      target_customer_count: run.targetCustomerCount,
      status: run.status,
      current_step: run.currentStep,
      keyword_review_status: run.keywordReviewStatus,
      email_review_status: run.emailReviewStatus,
      metadata: run.metadata ?? {},
      created_at: run.createdAt,
      updated_at: run.updatedAt
    }))
  );
  return mapInserted(rows);
}

async function insertImportJobs(organizationId: string, importJobs: ImportJob[], runMap: IdMap) {
  const rows = await insertRows(
    "import_jobs",
    importJobs.map((job) => ({
      organization_id: organizationId,
      legacy_id: job.id,
      file_name: job.fileName,
      file_path: job.filePath,
      status: job.status,
      total_rows: job.totalRows,
      parsed_rows: job.parsedRows,
      company_count: job.companyCount,
      deduped_company_count: job.dedupedCompanyCount,
      missing_company_name_count: job.missingCompanyNameCount,
      error_message: job.errorMessage,
      run_id: lookup(runMap, job.runId),
      created_at: job.createdAt,
      updated_at: job.updatedAt
    }))
  );
  return mapInserted(rows);
}

async function insertImportRows(organizationId: string, importRows: ImportRow[], importJobMap: IdMap) {
  await insertRows(
    "import_rows",
    importRows.flatMap((row) => {
      const importJobId = lookup(importJobMap, row.importJobId);
      if (!importJobId) return [];
      return [{
        organization_id: organizationId,
        import_job_id: importJobId,
        legacy_id: row.id,
        row_index: row.rowIndex,
        raw_data: row.rawData,
        company_name: row.companyName,
        normalized_company_name: row.normalizedCompanyName,
        country: row.country,
        product_description: row.productDescription,
        transaction_summary: row.transactionSummary,
        source_keyword: row.sourceKeyword,
        status: row.status,
        created_at: row.createdAt,
        updated_at: row.updatedAt
      }];
    })
  );
}

async function insertColumnMappings(organizationId: string, mappings: ColumnMapping[], importJobMap: IdMap) {
  await insertRows(
    "column_mappings",
    mappings.flatMap((mapping) => {
      const importJobId = lookup(importJobMap, mapping.importJobId);
      if (!importJobId) return [];
      return [{
        organization_id: organizationId,
        import_job_id: importJobId,
        company_name_column: mapping.companyNameColumn,
        country_column: mapping.countryColumn,
        product_description_column: mapping.productDescriptionColumn,
        transaction_summary_column: mapping.transactionSummaryColumn,
        source_keyword_column: mapping.sourceKeywordColumn
      }];
    })
  );
}

async function insertRunSteps(organizationId: string, steps: RunStep[], runMap: IdMap) {
  await insertRows(
    "run_steps",
    steps.flatMap((step) => {
      const runId = lookup(runMap, step.runId);
      if (!runId) return [];
      return [{
        organization_id: organizationId,
        run_id: runId,
        legacy_id: step.id,
        step_key: step.stepKey,
        step_order: step.order,
        label: step.label,
        status: step.status,
        summary: step.summary,
        input_snapshot: step.inputSnapshot,
        output_snapshot: step.outputSnapshot,
        error_message: step.errorMessage,
        started_at: step.startedAt,
        completed_at: step.completedAt,
        created_at: step.createdAt,
        updated_at: step.updatedAt
      }];
    })
  );
}

async function insertKeywords(organizationId: string, keywords: Keyword[], runMap: IdMap) {
  await insertRows(
    "keywords",
    keywords.flatMap((keyword) => {
      const runId = lookup(runMap, keyword.runId);
      if (!runId) return [];
      return [{
        organization_id: organizationId,
        run_id: runId,
        legacy_id: keyword.id,
        value: keyword.value,
        language: keyword.language,
        source: normalizeKeywordSource(keyword.source),
        status: keyword.status,
        confidence: keyword.confidence,
        reason: keyword.reason,
        evidence_ids: [],
        created_at: keyword.createdAt,
        updated_at: keyword.updatedAt
      }];
    })
  );
}

async function insertSearchProviderUsage(organizationId: string, usage: SearchProviderUsage[]) {
  await insertRows(
    "search_provider_usage",
    usage.map((item) => ({
      organization_id: organizationId,
      provider: item.provider,
      total_queries: item.totalQueries,
      successful_queries: item.successfulQueries,
      failed_queries: item.failedQueries,
      fallback_count: item.fallbackCount,
      last_used_at: item.lastUsedAt,
      last_error: item.lastError,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    }))
  );
}

async function insertCompanies(organizationId: string, companies: Company[], runMap: IdMap, importJobMap: IdMap) {
  const rows = await insertRows(
    "companies",
    companies.map((company) => ({
      organization_id: organizationId,
      run_id: lookup(runMap, company.runId),
      import_job_id: lookup(importJobMap, company.importJobId),
      legacy_id: company.id,
      name: company.name,
      legal_name: company.legalName,
      normalized_name: company.normalizedName,
      country: company.country,
      city: company.city,
      website: company.website,
      domain: company.domain,
      industry: company.industry,
      products: company.products ?? [],
      importer_profile: company.importerProfile,
      buyer_fit: company.buyerFit,
      buyer_fit_score: company.buyerFitScore,
      buyer_fit_tier: company.buyerFitTier,
      company_role: company.companyRole,
      buyer_fit_reasons: company.buyerFitReasons ?? [],
      buyer_fit_risks: company.buyerFitRisks ?? [],
      lead_score: company.leadScore,
      confidence: company.confidence,
      suggested_action: company.suggestedAction,
      source_keyword: company.sourceKeyword,
      source_query: company.sourceQuery,
      source_provider: company.sourceProvider,
      product_description: company.productDescription,
      transaction_summary: company.transactionSummary,
      enrichment_status: company.enrichmentStatus,
      website_status: company.websiteStatus,
      contact_status: company.contactStatus,
      contact_confidence: company.contactConfidence,
      primary_website: company.primaryWebsite,
      recommended_emails: company.recommendedEmails ?? [],
      recommended_phone: company.recommendedPhone,
      recommended_whatsapp: company.recommendedWhatsapp,
      recommended_social_links: company.recommendedSocialLinks ?? {},
      evidence_summary: company.evidenceSummary,
      enrichment_logs: company.enrichmentLogs ?? [],
      status: company.status ?? "new",
      source: company.source === "cross_border_search" ? "cross_search_legacy" : company.source,
      evidence_ids: [],
      email_draft_ids: [],
      created_at: company.createdAt,
      updated_at: company.updatedAt
    }))
  );
  return mapInserted(rows);
}

async function insertContacts(organizationId: string, contacts: Contact[], runMap: IdMap, companyMap: IdMap) {
  const rows = await insertRows(
    "contacts",
    contacts.flatMap((contact) => {
      const companyId = lookup(companyMap, contact.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, contact.runId),
        company_id: companyId,
        legacy_id: contact.id,
        full_name: contact.fullName,
        title: contact.title,
        department: contact.department,
        source: contact.source,
        confidence: contact.confidence,
        evidence_ids: [],
        created_at: contact.createdAt,
        updated_at: contact.updatedAt
      }];
    })
  );
  return mapInserted(rows);
}

async function insertEmailAddresses(
  organizationId: string,
  emails: EmailAddress[],
  runMap: IdMap,
  companyMap: IdMap,
  contactMap: IdMap
) {
  const rows = await insertRows(
    "company_emails",
    emails.flatMap((email) => {
      const companyId = lookup(companyMap, email.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, email.runId),
        company_id: companyId,
        contact_id: lookup(contactMap, email.contactId),
        legacy_id: email.id,
        email: email.email,
        domain: email.domain,
        source: email.source,
        confidence: email.confidence,
        verification_status: email.verificationStatus,
        evidence_ids: [],
        created_at: email.createdAt,
        updated_at: email.updatedAt
      }];
    })
  );
  return mapInserted(rows);
}

async function insertPhones(
  organizationId: string,
  phones: PhoneNumber[],
  whatsapps: WhatsappNumber[],
  runMap: IdMap,
  companyMap: IdMap,
  contactMap: IdMap
) {
  const phoneRows = [
    ...phones.map((phone) => ({ ...phone, phoneType: "phone" as const })),
    ...whatsapps.map((whatsapp) => ({ ...whatsapp, phoneType: "whatsapp" as const }))
  ];
  await insertRows(
    "company_phones",
    phoneRows.flatMap((phone) => {
      const companyId = lookup(companyMap, phone.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, phone.runId),
        company_id: companyId,
        contact_id: lookup(contactMap, phone.contactId),
        legacy_id: phone.id,
        phone_type: phone.phoneType,
        number: phone.number,
        country_code: phone.countryCode,
        source: phone.source,
        confidence: phone.confidence,
        evidence_ids: [],
        created_at: phone.createdAt,
        updated_at: phone.updatedAt
      }];
    })
  );
}

async function insertEvidence(
  organizationId: string,
  evidence: Evidence[],
  runMap: IdMap,
  companyMap: IdMap,
  contactMap: IdMap
) {
  const rows = await insertRows(
    "evidence",
    evidence.map((item) => ({
      organization_id: organizationId,
      run_id: lookup(runMap, item.runId),
      company_id: lookup(companyMap, item.companyId),
      contact_id: lookup(contactMap, item.contactId),
      legacy_id: item.id,
      provider: item.provider,
      source_provider: item.sourceProvider,
      type: item.type,
      source: item.source,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      raw_text: item.rawText,
      confidence: item.confidence,
      raw_json: item.rawJson ?? item.raw,
      created_at: item.createdAt,
      updated_at: item.updatedAt
    }))
  );
  return mapInserted(rows);
}

async function insertEmailDrafts(
  organizationId: string,
  drafts: EmailDraft[],
  runMap: IdMap,
  companyMap: IdMap,
  contactMap: IdMap,
  emailMap: IdMap,
  evidenceMap: IdMap
) {
  const rows = await insertRows(
    "email_drafts",
    drafts.flatMap((draft) => {
      const companyId = lookup(companyMap, draft.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, draft.runId),
        company_id: companyId,
        contact_id: lookup(contactMap, draft.contactId),
        to_email_address_id: lookup(emailMap, draft.toEmailAddressId),
        legacy_id: draft.id,
        to_email: draft.toEmail,
        subject: draft.subject,
        body: draft.body,
        status: draft.status,
        used_evidence_ids: mapIds(evidenceMap, draft.usedEvidenceIds ?? []),
        style_notes: draft.styleNotes ?? [],
        approved_at: draft.approvedAt,
        skipped_at: draft.skippedAt,
        sent_at: draft.sentAt,
        edited_at: draft.editedAt,
        error_message: draft.errorMessage,
        provider: draft.provider,
        personalization_notes: draft.personalizationNotes ?? [],
        evidence_ids: mapIds(evidenceMap, draft.evidenceIds ?? []),
        created_at: draft.createdAt,
        updated_at: draft.updatedAt
      }];
    })
  );
  return mapInserted(rows);
}

async function insertEmailLogs(organizationId: string, logs: EmailLog[], runMap: IdMap, companyMap: IdMap, draftMap: IdMap) {
  await insertRows(
    "email_logs",
    logs.flatMap((log) => {
      const companyId = lookup(companyMap, log.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, log.runId),
        email_draft_id: lookup(draftMap, log.emailDraftId),
        company_id: companyId,
        legacy_id: log.id,
        provider: log.provider,
        action: log.action,
        status: log.status,
        to_email: log.toEmail,
        from_email: log.fromEmail,
        subject: log.subject,
        provider_message_id: log.providerMessageId,
        error_message: log.errorMessage,
        attempted_at: log.attemptedAt,
        created_at: log.createdAt,
        updated_at: log.updatedAt
      }];
    })
  );
}

async function insertAuditLogs(
  organizationId: string,
  logs: AuditLog[],
  runMap: IdMap,
  companyMap: IdMap,
  draftMap: IdMap
) {
  await insertRowsIfExists(
    "audit_logs",
    logs.map((log) => ({
      organization_id: organizationId,
      legacy_id: log.id,
      actor_type: log.actorType,
      actor_id: log.actorId,
      action: log.action,
      resource_type: log.resourceType,
      resource_id: mappedAuditResourceId(log, runMap, companyMap, draftMap),
      resource_legacy_id: log.resourceId,
      status: log.status,
      ip_address: log.ipAddress,
      user_agent: log.userAgent,
      request_id: log.requestId,
      metadata: log.metadata ?? {},
      error_message: log.errorMessage,
      created_at: log.createdAt,
      updated_at: log.updatedAt
    }))
  );
}

async function insertCompanyNotes(organizationId: string, notes: CompanyNote[], companyMap: IdMap) {
  await insertRows(
    "company_notes",
    notes.flatMap((note) => {
      const companyId = lookup(companyMap, note.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        company_id: companyId,
        legacy_id: note.id,
        content: note.content,
        created_at: note.createdAt,
        updated_at: note.updatedAt
      }];
    })
  );
}

async function insertSearchQueryLogs(
  organizationId: string,
  logs: SearchQueryLog[],
  companyMap: IdMap,
  importJobMap: IdMap
) {
  await insertRows(
    "search_query_logs",
    logs.map((log) => ({
      organization_id: organizationId,
      company_id: lookup(companyMap, log.companyId),
      import_job_id: lookup(importJobMap, log.importJobId),
      query: log.query,
      search_type: log.searchType,
      mode: log.mode,
      provider: log.provider,
      status: log.status,
      result_count: log.resultCount,
      average_confidence: log.averageConfidence,
      fallback_reason: log.fallbackReason,
      error_message: log.errorMessage,
      created_at: log.createdAt,
      updated_at: log.updatedAt
    }))
  );
}

function companyToRow(organizationId: string, company: Company, runMap: IdMap, importJobMap: IdMap) {
  return {
    organization_id: organizationId,
    run_id: lookup(runMap, company.runId),
    import_job_id: lookup(importJobMap, company.importJobId),
    legacy_id: company.id,
    name: company.name,
    legal_name: company.legalName,
    normalized_name: company.normalizedName,
    country: company.country,
    city: company.city,
    website: company.website,
    domain: company.domain,
    industry: company.industry,
    products: company.products ?? [],
    importer_profile: company.importerProfile,
    buyer_fit: company.buyerFit,
    buyer_fit_score: company.buyerFitScore,
    buyer_fit_tier: company.buyerFitTier,
    company_role: company.companyRole,
    buyer_fit_reasons: company.buyerFitReasons ?? [],
    buyer_fit_risks: company.buyerFitRisks ?? [],
    lead_score: company.leadScore,
    confidence: company.confidence,
    suggested_action: company.suggestedAction,
    source_keyword: company.sourceKeyword,
    source_query: company.sourceQuery,
    source_provider: company.sourceProvider,
    product_description: company.productDescription,
    transaction_summary: company.transactionSummary,
    enrichment_status: company.enrichmentStatus,
    website_status: company.websiteStatus,
    contact_status: company.contactStatus,
    contact_confidence: company.contactConfidence,
    primary_website: company.primaryWebsite,
    recommended_emails: company.recommendedEmails ?? [],
    recommended_phone: company.recommendedPhone,
    recommended_whatsapp: company.recommendedWhatsapp,
    recommended_social_links: company.recommendedSocialLinks ?? {},
    evidence_summary: company.evidenceSummary,
    enrichment_logs: company.enrichmentLogs ?? [],
    status: company.status ?? "new",
    source: company.source === "cross_border_search" ? "cross_search_legacy" : company.source,
    evidence_ids: [],
    email_draft_ids: [],
    created_at: company.createdAt,
    updated_at: company.updatedAt
  };
}

function companyPatchToRow(
  patch: Partial<Omit<Company, "id" | "createdAt">>,
  runMap: IdMap,
  importJobMap: IdMap,
  evidenceMap: IdMap
) {
  return compactRow({
    run_id: patch.runId ? lookup(runMap, patch.runId) : undefined,
    import_job_id: patch.importJobId ? lookup(importJobMap, patch.importJobId) : undefined,
    name: patch.name,
    legal_name: patch.legalName,
    normalized_name: patch.normalizedName,
    country: patch.country,
    city: patch.city,
    website: patch.website,
    domain: patch.domain,
    industry: patch.industry,
    products: patch.products,
    importer_profile: patch.importerProfile,
    buyer_fit: patch.buyerFit,
    buyer_fit_score: patch.buyerFitScore,
    buyer_fit_tier: patch.buyerFitTier,
    company_role: patch.companyRole,
    buyer_fit_reasons: patch.buyerFitReasons,
    buyer_fit_risks: patch.buyerFitRisks,
    lead_score: patch.leadScore,
    confidence: patch.confidence,
    suggested_action: patch.suggestedAction,
    source_keyword: patch.sourceKeyword,
    source_query: patch.sourceQuery,
    source_provider: patch.sourceProvider,
    product_description: patch.productDescription,
    transaction_summary: patch.transactionSummary,
    enrichment_status: patch.enrichmentStatus,
    website_status: patch.websiteStatus,
    contact_status: patch.contactStatus,
    contact_confidence: patch.contactConfidence,
    primary_website: patch.primaryWebsite,
    recommended_emails: patch.recommendedEmails,
    recommended_phone: patch.recommendedPhone,
    recommended_whatsapp: patch.recommendedWhatsapp,
    recommended_social_links: patch.recommendedSocialLinks,
    evidence_summary: patch.evidenceSummary,
    enrichment_logs: patch.enrichmentLogs,
    status: patch.status,
    source: patch.source === "cross_border_search" ? "cross_search_legacy" : patch.source,
    evidence_ids: patch.evidenceIds ? mapIds(evidenceMap, patch.evidenceIds) : undefined,
    updated_at: now()
  });
}

async function upsertPhoneRows(
  organizationId: string,
  phones: Array<PhoneNumber | WhatsappNumber>,
  phoneType: "phone" | "whatsapp"
) {
  const [runMap, companyMap, contactMap, evidenceMap] = await Promise.all([
    legacyUuidMap("runs", organizationId, phones.map((phone) => phone.runId)),
    legacyUuidMap("companies", organizationId, phones.map((phone) => phone.companyId)),
    legacyUuidMap("contacts", organizationId, phones.map((phone) => phone.contactId)),
    legacyUuidMap("evidence", organizationId, phones.flatMap((phone) => phone.evidenceIds))
  ]);
  return upsertRows(
    "company_phones",
    phones.flatMap((phone) => {
      const companyId = lookup(companyMap, phone.companyId);
      if (!companyId) return [];
      return [{
        organization_id: organizationId,
        run_id: lookup(runMap, phone.runId),
        company_id: companyId,
        contact_id: lookup(contactMap, phone.contactId),
        legacy_id: phone.id,
        phone_type: phoneType,
        number: phone.number,
        country_code: phone.countryCode,
        source: phone.source,
        confidence: phone.confidence,
        evidence_ids: mapIds(evidenceMap, phone.evidenceIds),
        created_at: phone.createdAt,
        updated_at: phone.updatedAt
      }];
    })
  );
}

function rowToRun(row: Row): Run {
  return {
    id: legacyId(row),
    productInput: stringValue(row.product_input),
    normalizedProduct: optionalString(row.normalized_product),
    targetCustomerCount: numberValue(row.target_customer_count),
    status: stringValue(row.status) as Run["status"],
    currentStep: optionalString(row.current_step) as Run["currentStep"],
    keywordReviewStatus: stringValue(row.keyword_review_status) as Run["keywordReviewStatus"],
    emailReviewStatus: stringValue(row.email_review_status) as Run["emailReviewStatus"],
    metadata: objectValue(row.metadata),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToRunStep(row: Row, runIdByUuid: IdMap): RunStep {
  return {
    id: legacyId(row),
    runId: reverseLookup(runIdByUuid, row.run_id),
    stepKey: stringValue(row.step_key) as RunStep["stepKey"],
    order: numberValue(row.step_order),
    label: stringValue(row.label),
    status: stringValue(row.status) as RunStep["status"],
    summary: optionalString(row.summary),
    inputSnapshot: row.input_snapshot,
    outputSnapshot: row.output_snapshot,
    errorMessage: optionalString(row.error_message),
    startedAt: optionalString(row.started_at),
    completedAt: optionalString(row.completed_at),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToKeyword(row: Row, runIdByUuid: IdMap): Keyword {
  return {
    id: legacyId(row),
    runId: reverseLookup(runIdByUuid, row.run_id),
    value: stringValue(row.value),
    language: "en",
    source: stringValue(row.source) as Keyword["source"],
    status: stringValue(row.status) as Keyword["status"],
    confidence: optionalNumber(row.confidence),
    reason: optionalString(row.reason),
    evidenceIds: [],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToImportJob(row: Row, runIdByUuid: IdMap): ImportJob {
  return {
    id: legacyId(row),
    fileName: stringValue(row.file_name),
    filePath: stringValue(row.file_path),
    status: stringValue(row.status) as ImportJob["status"],
    totalRows: numberValue(row.total_rows),
    parsedRows: numberValue(row.parsed_rows),
    companyCount: numberValue(row.company_count),
    dedupedCompanyCount: numberValue(row.deduped_company_count),
    missingCompanyNameCount: numberValue(row.missing_company_name_count),
    errorMessage: optionalString(row.error_message),
    runId: reverseLookupOptional(runIdByUuid, row.run_id),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToImportRow(row: Row, importJobIdByUuid: IdMap): ImportRow {
  return {
    id: legacyId(row),
    importJobId: reverseLookup(importJobIdByUuid, row.import_job_id),
    rowIndex: numberValue(row.row_index),
    rawData: objectValue(row.raw_data) as Record<string, string>,
    companyName: optionalString(row.company_name),
    normalizedCompanyName: optionalString(row.normalized_company_name),
    country: optionalString(row.country),
    productDescription: optionalString(row.product_description),
    transactionSummary: optionalString(row.transaction_summary),
    sourceKeyword: optionalString(row.source_keyword),
    status: stringValue(row.status) as ImportRow["status"],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToColumnMapping(row: Row, importJobIdByUuid: IdMap): ColumnMapping {
  return {
    importJobId: reverseLookup(importJobIdByUuid, row.import_job_id),
    companyNameColumn: optionalString(row.company_name_column),
    countryColumn: optionalString(row.country_column),
    productDescriptionColumn: optionalString(row.product_description_column),
    transactionSummaryColumn: optionalString(row.transaction_summary_column),
    sourceKeywordColumn: optionalString(row.source_keyword_column)
  };
}

function rowToSearchQueryLog(row: Row, companyIdByUuid: IdMap, importJobIdByUuid: IdMap): SearchQueryLog {
  return {
    id: legacyId(row),
    companyId: reverseLookupOptional(companyIdByUuid, row.company_id),
    importJobId: reverseLookupOptional(importJobIdByUuid, row.import_job_id),
    query: stringValue(row.query),
    searchType: stringValue(row.search_type) as SearchQueryType,
    mode: stringValue(row.mode) as SearchMode,
    provider: optionalString(row.provider) as SearchProviderName | undefined,
    status: stringValue(row.status) as SearchQueryLog["status"],
    resultCount: numberValue(row.result_count),
    averageConfidence: optionalNumber(row.average_confidence),
    fallbackReason: optionalString(row.fallback_reason),
    errorMessage: optionalString(row.error_message),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToSearchProviderUsage(row: Row): SearchProviderUsage {
  return {
    id: legacyId(row),
    provider: stringValue(row.provider) as SearchProviderName,
    totalQueries: numberValue(row.total_queries),
    successfulQueries: numberValue(row.successful_queries),
    failedQueries: numberValue(row.failed_queries),
    fallbackCount: numberValue(row.fallback_count),
    lastUsedAt: optionalString(row.last_used_at),
    lastError: optionalString(row.last_error),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToCompany(row: Row, runIdByUuid: IdMap, importJobIdByUuid: IdMap): Company {
  return {
    id: legacyId(row),
    runId: reverseLookup(runIdByUuid, row.run_id),
    importJobId: reverseLookupOptional(importJobIdByUuid, row.import_job_id),
    name: stringValue(row.name),
    legalName: optionalString(row.legal_name),
    normalizedName: optionalString(row.normalized_name),
    country: optionalString(row.country),
    city: optionalString(row.city),
    website: optionalString(row.website),
    domain: optionalString(row.domain),
    industry: optionalString(row.industry),
    products: stringArray(row.products),
    importerProfile: optionalString(row.importer_profile),
    emails: [],
    whatsappNumbers: [],
    buyerFit: objectValue(row.buyer_fit) as Company["buyerFit"],
    buyerFitScore: optionalNumber(row.buyer_fit_score),
    buyerFitTier: optionalString(row.buyer_fit_tier) as Company["buyerFitTier"],
    companyRole: optionalString(row.company_role) as Company["companyRole"],
    buyerFitReasons: stringArray(row.buyer_fit_reasons),
    buyerFitRisks: stringArray(row.buyer_fit_risks),
    leadScore: optionalNumber(row.lead_score),
    confidence: optionalNumber(row.confidence),
    suggestedAction: optionalString(row.suggested_action) as Company["suggestedAction"],
    sourceKeyword: optionalString(row.source_keyword),
    sourceQuery: optionalString(row.source_query),
    sourceProvider: optionalString(row.source_provider) as Company["sourceProvider"],
    productDescription: optionalString(row.product_description),
    transactionSummary: optionalString(row.transaction_summary),
    enrichmentStatus: optionalString(row.enrichment_status) as Company["enrichmentStatus"],
    websiteStatus: optionalString(row.website_status) as Company["websiteStatus"],
    contactStatus: optionalString(row.contact_status) as Company["contactStatus"],
    contactConfidence: optionalNumber(row.contact_confidence),
    primaryWebsite: optionalString(row.primary_website),
    recommendedEmails: stringArray(row.recommended_emails),
    recommendedPhone: optionalString(row.recommended_phone),
    recommendedWhatsapp: optionalString(row.recommended_whatsapp),
    recommendedSocialLinks: objectValue(row.recommended_social_links) as Company["recommendedSocialLinks"],
    evidenceSummary: optionalString(row.evidence_summary),
    enrichmentLogs: arrayValue(row.enrichment_logs) as Company["enrichmentLogs"],
    status: optionalString(row.status) as Company["status"],
    source: stringValue(row.source) === "cross_search_legacy" ? "cross_border_search" : stringValue(row.source) as Company["source"],
    evidenceIds: [],
    emailDraftIds: [],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToContact(row: Row, runIdByUuid: IdMap, companyIdByUuid: IdMap): Contact {
  return {
    id: legacyId(row),
    runId: reverseLookup(runIdByUuid, row.run_id),
    companyId: reverseLookup(companyIdByUuid, row.company_id),
    fullName: stringValue(row.full_name),
    title: optionalString(row.title),
    department: optionalString(row.department),
    source: stringValue(row.source) as Contact["source"],
    confidence: optionalNumber(row.confidence),
    evidenceIds: [],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToEmailAddress(row: Row, runIdByUuid: IdMap, companyIdByUuid: IdMap, contactIdByUuid: IdMap): EmailAddress {
  return {
    id: legacyId(row),
    runId: reverseLookup(runIdByUuid, row.run_id),
    companyId: reverseLookup(companyIdByUuid, row.company_id),
    contactId: reverseLookupOptional(contactIdByUuid, row.contact_id),
    email: stringValue(row.email),
    domain: stringValue(row.domain),
    source: stringValue(row.source) as EmailAddress["source"],
    confidence: optionalNumber(row.confidence),
    verificationStatus: stringValue(row.verification_status) as EmailAddress["verificationStatus"],
    evidenceIds: [],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToPhoneNumber(row: Row, runIdByUuid: IdMap, companyIdByUuid: IdMap, contactIdByUuid: IdMap): PhoneNumber {
  return {
    id: legacyId(row),
    runId: reverseLookup(runIdByUuid, row.run_id),
    companyId: reverseLookup(companyIdByUuid, row.company_id),
    contactId: reverseLookupOptional(contactIdByUuid, row.contact_id),
    number: stringValue(row.number),
    countryCode: optionalString(row.country_code),
    source: stringValue(row.source) as PhoneNumber["source"],
    confidence: optionalNumber(row.confidence),
    evidenceIds: [],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToWhatsappNumber(row: Row, runIdByUuid: IdMap, companyIdByUuid: IdMap, contactIdByUuid: IdMap): WhatsappNumber {
  return rowToPhoneNumber(row, runIdByUuid, companyIdByUuid, contactIdByUuid);
}

function rowToEvidence(row: Row, runIdByUuid: IdMap, companyIdByUuid: IdMap, contactIdByUuid: IdMap): Evidence {
  return {
    id: legacyId(row),
    runId: reverseLookup(runIdByUuid, row.run_id),
    companyId: reverseLookupOptional(companyIdByUuid, row.company_id),
    contactId: reverseLookupOptional(contactIdByUuid, row.contact_id),
    provider: stringValue(row.provider) as Evidence["provider"],
    sourceProvider: optionalString(row.source_provider) as Evidence["sourceProvider"],
    type: stringValue(row.type) as Evidence["type"],
    source: optionalString(row.source),
    title: optionalString(row.title),
    url: optionalString(row.url),
    snippet: optionalString(row.snippet),
    rawText: optionalString(row.raw_text),
    confidence: optionalNumber(row.confidence),
    raw: row.raw_json,
    rawJson: row.raw_json,
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToEmailDraft(
  row: Row,
  runIdByUuid: IdMap,
  companyIdByUuid: IdMap,
  contactIdByUuid: IdMap,
  emailIdByUuid: IdMap
): EmailDraft {
  return {
    id: legacyId(row),
    runId: reverseLookup(runIdByUuid, row.run_id),
    companyId: reverseLookup(companyIdByUuid, row.company_id),
    contactId: reverseLookupOptional(contactIdByUuid, row.contact_id),
    toEmailAddressId: reverseLookupOptional(emailIdByUuid, row.to_email_address_id),
    toEmail: optionalString(row.to_email),
    subject: stringValue(row.subject),
    body: stringValue(row.body),
    status: stringValue(row.status) as EmailDraft["status"],
    usedEvidenceIds: [],
    styleNotes: stringArray(row.style_notes),
    approvedAt: optionalString(row.approved_at),
    skippedAt: optionalString(row.skipped_at),
    sentAt: optionalString(row.sent_at),
    editedAt: optionalString(row.edited_at),
    errorMessage: optionalString(row.error_message),
    provider: stringValue(row.provider) as EmailDraft["provider"],
    personalizationNotes: stringArray(row.personalization_notes),
    evidenceIds: [],
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToCompanyNote(row: Row, companyIdByUuid: IdMap): CompanyNote {
  return {
    id: legacyId(row),
    companyId: reverseLookup(companyIdByUuid, row.company_id),
    content: stringValue(row.content),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToEmailLog(row: Row, runIdByUuid: IdMap, companyIdByUuid: IdMap, draftIdByUuid: IdMap): EmailLog {
  return {
    id: legacyId(row),
    runId: reverseLookup(runIdByUuid, row.run_id),
    emailDraftId: reverseLookup(draftIdByUuid, row.email_draft_id),
    companyId: reverseLookup(companyIdByUuid, row.company_id),
    provider: stringValue(row.provider) as EmailLog["provider"],
    action: stringValue(row.action) as EmailLog["action"],
    status: stringValue(row.status) as EmailLog["status"],
    toEmail: optionalString(row.to_email),
    fromEmail: optionalString(row.from_email),
    subject: optionalString(row.subject),
    providerMessageId: optionalString(row.provider_message_id),
    errorMessage: optionalString(row.error_message),
    attemptedAt: stringValue(row.attempted_at),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function rowToAuditLog(row: Row, runIdByUuid: IdMap, companyIdByUuid: IdMap, draftIdByUuid: IdMap): AuditLog {
  const resourceType = stringValue(row.resource_type);
  const resourceUuid = row.resource_id;
  const resourceId =
    resourceType === "run"
      ? reverseLookupOptional(runIdByUuid, resourceUuid)
      : resourceType === "company"
        ? reverseLookupOptional(companyIdByUuid, resourceUuid)
        : resourceType === "email_draft"
          ? reverseLookupOptional(draftIdByUuid, resourceUuid)
          : optionalString(row.resource_legacy_id) ?? optionalString(row.resource_id);

  return {
    id: legacyId(row),
    actorType: stringValue(row.actor_type) as AuditLog["actorType"],
    actorId: optionalString(row.actor_id),
    action: stringValue(row.action),
    resourceType,
    resourceId: resourceId ?? optionalString(row.resource_legacy_id),
    status: stringValue(row.status) as AuditLog["status"],
    ipAddress: optionalString(row.ip_address),
    userAgent: optionalString(row.user_agent),
    requestId: optionalString(row.request_id),
    metadata: objectValue(row.metadata),
    errorMessage: optionalString(row.error_message),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at)
  };
}

function mappedAuditResourceId(log: AuditLog, runMap: IdMap, companyMap: IdMap, draftMap: IdMap) {
  if (!log.resourceId) return undefined;
  if (log.resourceType === "run") return lookup(runMap, log.resourceId);
  if (log.resourceType === "company") return lookup(companyMap, log.resourceId);
  if (log.resourceType === "email_draft") return lookup(draftMap, log.resourceId);
  return undefined;
}

function isMissingRelationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Could not find the table") ||
    message.includes("does not exist") ||
    message.includes("42P01")
  );
}

function markOptionalTableMissing(table: string) {
  missingOptionalTableUntil.set(table, Date.now() + 60_000);
}

function isOptionalTableTemporarilyMissing(table: string) {
  const until = missingOptionalTableUntil.get(table);
  if (!until) return false;
  if (until > Date.now()) return true;
  missingOptionalTableUntil.delete(table);
  return false;
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

function statusFromStep(status: RunStep["status"]): Run["status"] {
  if (status === "waiting_review") return "waiting_review";
  if (status === "paused") return "paused";
  if (status === "failed") return "failed";
  if (status === "completed") return "running";
  if (status === "running") return "running";
  return "created";
}

function requireSupabase() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase admin client is not configured.");
  return supabase;
}

function createId(prefix: string) {
  return `${prefix}_${nanoid(10)}`;
}

function now() {
  return new Date().toISOString();
}

function mapInserted(rows: Row[]): IdMap {
  return new Map(rows.map((row) => [legacyId(row), stringValue(row.id)]));
}

function reverseMap(rows: Row[]): IdMap {
  return new Map(rows.map((row) => [stringValue(row.id), legacyId(row)]));
}

function lookup(map: IdMap, legacyIdValue: string | undefined) {
  return legacyIdValue ? map.get(legacyIdValue) : undefined;
}

function mapIds(map: IdMap, ids: string[]) {
  return ids.map((id) => map.get(id)).filter((id): id is string => Boolean(id));
}

function reverseLookup(map: IdMap, uuid: unknown) {
  return reverseLookupOptional(map, uuid) ?? stringValue(uuid);
}

function reverseLookupOptional(map: IdMap, uuid: unknown) {
  if (!uuid) return undefined;
  return map.get(String(uuid));
}

function legacyId(row: Row) {
  return optionalString(row.legacy_id) ?? stringValue(row.id);
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function optionalString(value: unknown) {
  return value === undefined || value === null ? undefined : String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizeKeywordSource(source: unknown): Keyword["source"] {
  if (source === "manual" || source === "mock") return source;
  return "llm";
}

function sanitizeForPostgres<T>(value: T): T {
  if (typeof value === "string") return sanitizeStringForPostgres(value) as T;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForPostgres(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeForPostgres(item)])
    ) as T;
  }

  return value;
}

function sanitizeStringForPostgres(value: string) {
  let output = "";

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code === 0) continue;

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[index] + value[index + 1];
        index += 1;
      } else {
        output += "\uFFFD";
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "\uFFFD";
      continue;
    }

    output += value[index];
  }

  return output;
}
