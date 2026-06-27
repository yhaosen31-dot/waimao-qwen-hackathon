import type { CustomerLead, EmailDraft, LeadEmail } from "@/lib/types";

export interface NormalizedProduct {
  normalizedProduct: string;
  productFamily: string;
  buyerIntent: string;
}

export interface RawImporterLead {
  companyName: string;
  country: string;
  city: string;
  source: string;
  importerProfile: string;
  products: string[];
  website?: string;
}

export interface CompanyDetails extends RawImporterLead {
  website: string;
  domain: string;
  annualImportEstimate: string;
}

export interface ContactIntel {
  whatsapp: string;
  phone: string;
  contactName: string;
  contactTitle: string;
}

export interface BuyerFitResult {
  score: number;
  reasons: string[];
}

export interface ProductNormalizer {
  normalize(input: string): Promise<NormalizedProduct>;
}

export interface KeywordProvider {
  generateKeywords(product: NormalizedProduct): Promise<string[]>;
}

export interface ImporterSearchProvider {
  searchImporters(keywords: string[], targetCount: number): Promise<RawImporterLead[]>;
}

export interface CompanyEnrichmentProvider {
  extractDetails(leads: RawImporterLead[]): Promise<CompanyDetails[]>;
}

export interface WebsiteResolverProvider {
  resolveMissingWebsites(companies: CompanyDetails[]): Promise<CompanyDetails[]>;
}

export interface EmailFinderProvider {
  findEmails(company: CompanyDetails): Promise<LeadEmail[]>;
}

export interface ContactIntelProvider {
  enrichContact(company: CompanyDetails): Promise<ContactIntel>;
}

export interface BuyerFitScorer {
  score(company: CompanyDetails, keywords: string[]): Promise<BuyerFitResult>;
}

export interface MailDraftProvider {
  createDraft(params: {
    customer: CustomerLead;
    normalizedProduct: string;
    keywords: string[];
  }): Promise<Omit<EmailDraft, "id" | "taskId" | "customerId" | "to" | "createdAt" | "updatedAt">>;
}

export interface MailSenderProvider {
  saveDraft(draft: EmailDraft): Promise<EmailDraft>;
}

export interface LeadGenerationProviders {
  normalizer: ProductNormalizer;
  keywordProvider: KeywordProvider;
  importerSearch: ImporterSearchProvider;
  companyEnrichment: CompanyEnrichmentProvider;
  websiteResolver: WebsiteResolverProvider;
  emailFinder: EmailFinderProvider;
  contactIntel: ContactIntelProvider;
  buyerFitScorer: BuyerFitScorer;
  mailDraftProvider: MailDraftProvider;
  mailSender: MailSenderProvider;
}
