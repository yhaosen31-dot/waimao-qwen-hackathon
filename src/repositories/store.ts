import * as localStore from "@/repositories/localStore";
import * as supabaseStore from "@/repositories/supabaseStore";
import { resolvedDataStoreProvider } from "@/repositories/storeConfig";
import type {
  ColumnMapping,
  Company,
  CreateImportJobInput,
  CreateRunInput,
  EmailDraft,
  EntityId,
  ImportJob,
  Run,
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
  SearchQueryType,
  UpdateRunStepInput,
  LocalJsonDatabase
} from "@/types";

type ActiveStore = typeof localStore | typeof supabaseStore;

function activeStore(): ActiveStore {
  return resolvedDataStoreProvider() === "supabase" ? supabaseStore : localStore;
}

export function createEmptyDatabase() {
  return activeStore().createEmptyDatabase();
}

export async function readStore() {
  return activeStore().readStore();
}

export async function readCrmStore() {
  return activeStore().readCrmStore();
}

export async function readReviewStore() {
  return activeStore().readReviewStore();
}

export async function writeStore(db: LocalJsonDatabase) {
  return activeStore().writeStore(db);
}

export async function resetStore() {
  return activeStore().resetStore();
}

export async function createImportJob(input: CreateImportJobInput) {
  return activeStore().createImportJob(input);
}

export async function updateImportJob(
  importJobId: EntityId,
  patch: Partial<Omit<ImportJob, "id" | "createdAt">>
) {
  return activeStore().updateImportJob(importJobId, patch);
}

export async function listImportJobs() {
  return activeStore().listImportJobs();
}

export async function getImportJob(importJobId: EntityId) {
  return activeStore().getImportJob(importJobId);
}

export async function saveImportRows(importJobId: EntityId, input: SaveImportRowInput[]) {
  return activeStore().saveImportRows(importJobId, input);
}

export async function getImportRows(importJobId: EntityId) {
  return activeStore().getImportRows(importJobId);
}

export async function saveColumnMapping(input: ColumnMapping) {
  return activeStore().saveColumnMapping(input);
}

export async function getColumnMapping(importJobId: EntityId) {
  return activeStore().getColumnMapping(importJobId);
}

export async function getImportJobResults(importJobId: EntityId) {
  return activeStore().getImportJobResults(importJobId);
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
  return activeStore().recordSearchQueryLog(input);
}

export async function updateSearchProviderUsage(input: {
  provider: SearchProviderName;
  success: boolean;
  fallbackUsed?: boolean;
  errorMessage?: string;
}) {
  return activeStore().updateSearchProviderUsage(input);
}

export async function createRun(input: CreateRunInput) {
  return activeStore().createRun(input);
}

export async function listRuns() {
  return activeStore().listRuns();
}

export async function updateRun(runId: EntityId, patch: Partial<Omit<Run, "id" | "createdAt">>) {
  return activeStore().updateRun(runId, patch);
}

export async function updateRunStep(
  runId: EntityId,
  stepKey: RunStep["stepKey"],
  patch: UpdateRunStepInput
) {
  return activeStore().updateRunStep(runId, stepKey, patch);
}

export async function saveKeywords(runId: EntityId, input: SaveKeywordInput[]) {
  return activeStore().saveKeywords(runId, input);
}

export async function saveCompanies(runId: EntityId, input: SaveCompanyInput[]) {
  return activeStore().saveCompanies(runId, input);
}

export async function updateCompany(
  companyId: EntityId,
  patch: Partial<Omit<Company, "id" | "createdAt">>
) {
  return activeStore().updateCompany(companyId, patch);
}

export async function saveCompanyNote(input: SaveCompanyNoteInput) {
  return activeStore().saveCompanyNote(input);
}

export async function listCompanyNotes(companyId: EntityId) {
  return activeStore().listCompanyNotes(companyId);
}

export async function updateCompaniesForRun(
  runId: EntityId,
  patcher: (company: Company) => Partial<Company>
) {
  return activeStore().updateCompaniesForRun(runId, patcher);
}

export async function saveContacts(runId: EntityId, input: SaveContactInput[]) {
  return activeStore().saveContacts(runId, input);
}

export async function saveEmailAddresses(runId: EntityId, input: SaveEmailAddressInput[]) {
  return activeStore().saveEmailAddresses(runId, input);
}

export async function saveWhatsappNumbers(runId: EntityId, input: SaveWhatsappNumberInput[]) {
  return activeStore().saveWhatsappNumbers(runId, input);
}

export async function savePhoneNumbers(runId: EntityId, input: SavePhoneNumberInput[]) {
  return activeStore().savePhoneNumbers(runId, input);
}

export async function saveEvidence(runId: EntityId, input: SaveEvidenceInput[]) {
  return activeStore().saveEvidence(runId, input);
}

export async function saveEmailDrafts(runId: EntityId, input: SaveEmailDraftInput[]) {
  return activeStore().saveEmailDrafts(runId, input);
}

export async function updateEmailDraft(
  draftId: EntityId,
  patch: Partial<Omit<EmailDraft, "id" | "runId" | "createdAt">>
) {
  return activeStore().updateEmailDraft(draftId, patch);
}

export async function updateEmailDraftsForRun(
  runId: EntityId,
  patcher: (draft: EmailDraft) => Partial<EmailDraft>
) {
  return activeStore().updateEmailDraftsForRun(runId, patcher);
}

export async function saveEmailLogs(runId: EntityId, input: SaveEmailLogInput[]) {
  return activeStore().saveEmailLogs(runId, input);
}

export async function saveAuditLogs(input: SaveAuditLogInput[]) {
  return activeStore().saveAuditLogs(input);
}

export async function listAuditLogs(limit?: number) {
  return activeStore().listAuditLogs(limit);
}

export async function getRunResults(runId: EntityId) {
  return activeStore().getRunResults(runId);
}

export async function listCompanies() {
  return activeStore().listCompanies();
}

export async function listEmailDrafts() {
  return activeStore().listEmailDrafts();
}

export async function getEmailDraft(draftId: EntityId) {
  return activeStore().getEmailDraft(draftId);
}

export async function getCompanyResults(companyId: EntityId) {
  return activeStore().getCompanyResults(companyId);
}

export { localStore, supabaseStore };
export { supabaseStoreStatus, testSupabaseStoreConnection } from "@/repositories/supabaseStore";
export {
  dataStoreStatus,
  requestedDataStoreProvider,
  resolvedDataStoreProvider,
  type DataStoreProvider
} from "@/repositories/storeConfig";
