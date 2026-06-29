import {
  buyerFitLabels,
  companyStatusLabels,
  emailStatusLabels,
  labelValue,
  sourceLabels,
  suggestedActionLabels
} from "@/lib/crm-labels";
import { readCrmStore } from "@/repositories/store";
import type {
  Company,
  CompanyEnrichmentStatus,
  CompanyNote,
  CompanyRole,
  CompanyStatus,
  EmailAddress,
  EmailDraft,
  EmailDraftStatus,
  Evidence,
  EvidenceProvider,
  LocalJsonDatabase,
  PhoneNumber,
  SuggestedAction,
  WhatsappNumber
} from "@/types";

export const crmCompanyStatuses: CompanyStatus[] = [
  "new",
  "imported_candidate",
  "product_search_candidate",
  "enriched",
  "scored",
  "drafted",
  "email_approved",
  "email_skipped",
  "contacted",
  "replied",
  "invalid",
  "blacklist",
  "saved_to_crm"
];

export const crmSources: EvidenceProvider[] = ["excel_import", "product_search", "manual"];
export const crmEnrichmentStatuses: CompanyEnrichmentStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "needs_review"
];
export const crmBuyerFitTiers = ["high", "medium", "low", "unknown"] as const;
export const crmSuggestedActions: SuggestedAction[] = [
  "email_first",
  "whatsapp_first",
  "manual_review",
  "skip"
];
export const crmCompanyRoles: CompanyRole[] = [
  "importer",
  "distributor",
  "trading_company",
  "manufacturer",
  "end_user",
  "unknown"
];
export const crmEmailStatuses: Array<EmailDraftStatus | "none"> = [
  "none",
  "draft",
  "waiting_review",
  "approved",
  "skipped",
  "saved",
  "sent",
  "failed"
];

export interface CompanyCrmFilters {
  q?: string;
  filter?: string;
  page?: string;
  pageSize?: string;
  source?: string;
  country?: string;
  buyerFit?: string;
  companyRole?: string;
  suggestedAction?: string;
  hasWebsite?: string;
  hasEmail?: string;
  hasWhatsapp?: string;
  enrichmentStatus?: string;
  emailStatus?: string;
  status?: string;
  leadScoreMin?: string;
  leadScoreMax?: string;
}

export interface CrmCompanyRecord extends Company {
  emailAddresses: EmailAddress[];
  whatsappRecords: WhatsappNumber[];
  phoneNumbers: PhoneNumber[];
  emailDrafts: EmailDraft[];
  evidence: Evidence[];
  companyNotes: CompanyNote[];
  primaryEmail?: string;
  primaryWhatsapp?: string;
  emailStatus: EmailDraftStatus | "none";
  evidenceCount: number;
  latestEmailDraft?: EmailDraft;
  notesText: string;
}

export async function getFilteredCrmCompanies(filters: CompanyCrmFilters = {}) {
  const db = await readCrmStore();
  const companies = filterCrmCompanies(hydrateCrmCompanies(db), filters);

  return {
    companies,
    db
  };
}

export function hydrateCrmCompanies(db: LocalJsonDatabase): CrmCompanyRecord[] {
  return db.companies
    .map((company) => {
      const emailAddresses = db.emailAddresses.filter((email) => email.companyId === company.id);
      const whatsappRecords = db.whatsappNumbers.filter(
        (whatsapp) => whatsapp.companyId === company.id
      );
      const phoneNumbers = db.phoneNumbers.filter((phone) => phone.companyId === company.id);
      const emailDrafts = db.emailDrafts
        .filter((draft) => draft.companyId === company.id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const evidence = db.evidence.filter((item) => item.companyId === company.id);
      const companyNotes = db.companyNotes
        .filter((note) => note.companyId === company.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latestEmailDraft = emailDrafts[0];

      return {
        ...company,
        emailAddresses,
        whatsappRecords,
        phoneNumbers,
        emailDrafts,
        evidence,
        companyNotes,
        latestEmailDraft,
        primaryEmail: company.recommendedEmails?.[0] ?? emailAddresses[0]?.email,
        primaryWhatsapp: company.recommendedWhatsapp ?? whatsappRecords[0]?.number,
        emailStatus: latestEmailDraft?.status ?? "none",
        evidenceCount: evidence.length,
        notesText: companyNotes.map((note) => note.content).join(" | ")
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function filterCrmCompanies(
  companies: CrmCompanyRecord[],
  filters: CompanyCrmFilters = {}
): CrmCompanyRecord[] {
  const leadScoreMin = parseNumber(filters.leadScoreMin);
  const leadScoreMax = parseNumber(filters.leadScoreMax);
  const hasWebsite = parseBoolean(filters.hasWebsite);
  const hasEmail = parseBoolean(filters.hasEmail);
  const hasWhatsapp = parseBoolean(filters.hasWhatsapp);
  const query = normalizeSearchText(filters.q);

  return companies.filter((company) => {
    if (!matchesLegacyFilter(company, filters.filter)) return false;
    if (filters.source && company.source !== filters.source) return false;
    if (filters.country && (company.country ?? "") !== filters.country) return false;
    if (filters.buyerFit && company.buyerFitTier !== filters.buyerFit) return false;
    if (filters.companyRole && company.companyRole !== filters.companyRole) return false;
    if (filters.suggestedAction && company.suggestedAction !== filters.suggestedAction) return false;
    if (filters.enrichmentStatus && (company.enrichmentStatus ?? "pending") !== filters.enrichmentStatus) {
      return false;
    }
    if (filters.emailStatus && company.emailStatus !== filters.emailStatus) return false;
    if (filters.status && (company.status ?? "new") !== filters.status) return false;
    if (leadScoreMin !== undefined && getLeadScore(company) < leadScoreMin) return false;
    if (leadScoreMax !== undefined && getLeadScore(company) > leadScoreMax) return false;
    if (hasWebsite !== undefined && Boolean(company.primaryWebsite ?? company.website) !== hasWebsite) {
      return false;
    }
    if (hasEmail !== undefined && Boolean(company.primaryEmail) !== hasEmail) return false;
    if (hasWhatsapp !== undefined && Boolean(company.primaryWhatsapp) !== hasWhatsapp) return false;
    if (query && !companyMatchesSearch(company, query)) return false;

    return true;
  });
}

export function buildCompaniesCsv(companies: CrmCompanyRecord[]) {
  const headers = [
    "公司名",
    "国家",
    "官网",
    "推荐邮箱",
    "WhatsApp",
    "客户匹配度",
    "线索分",
    "建议动作",
    "客户状态",
    "邮件状态",
    "来源",
    "来源 Query",
    "来源 Provider",
    "产品描述",
    "备注"
  ];

  const rows = companies.map((company) => [
    company.name,
    company.country ?? "",
    company.primaryWebsite ?? company.website ?? "",
    company.primaryEmail ?? "",
    company.primaryWhatsapp ?? "",
    labelValue(company.buyerFitTier, buyerFitLabels, ""),
    String(getLeadScore(company)),
    labelValue(company.suggestedAction, suggestedActionLabels, ""),
    labelValue(company.status ?? "new", companyStatusLabels, ""),
    labelValue(company.emailStatus, emailStatusLabels, ""),
    labelValue(company.source, sourceLabels, ""),
    company.sourceQuery ?? company.sourceKeyword ?? "",
    company.sourceProvider ?? "",
    company.productDescription ?? company.products.join(", "),
    company.notesText
  ]);

  return `\ufeff${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
}

export function getLeadScore(company: Company) {
  return company.leadScore ?? company.buyerFitScore ?? company.buyerFit?.score ?? 0;
}

function companyMatchesSearch(company: CrmCompanyRecord, query: string) {
  const values = [
    company.name,
    company.country,
    company.domain,
    company.website,
    company.primaryWebsite,
    company.primaryEmail,
    company.primaryWhatsapp,
    company.productDescription,
    company.sourceQuery,
    company.sourceProvider,
    ...company.emailAddresses.map((email) => email.email),
    ...company.whatsappRecords.map((whatsapp) => whatsapp.number)
  ];

  return values.some((value) => normalizeSearchText(value).includes(query));
}

function matchesLegacyFilter(company: CrmCompanyRecord, filter?: string) {
  if (!filter) return true;
  const score = getLeadScore(company);

  if (filter === "high_fit") return score >= 85;
  if (filter === "medium_fit") return score >= 70 && score < 85;
  if (filter === "low_fit") return score < 70;
  if (filter === "email_approved") return company.emailStatus === "approved";
  if (filter === "email_skipped") return company.emailStatus === "skipped";
  if (filter === "excel_import") return company.source === "excel_import";
  if (filter === "product_search") return company.source === "product_search";
  if (filter === "saved_to_crm") return company.status === "saved_to_crm";

  return true;
}

function parseBoolean(value?: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeSearchText(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

function escapeCsvCell(value: string) {
  const cell = value.replace(/\r?\n/g, " ").trim();
  return `"${cell.replace(/"/g, '""')}"`;
}
