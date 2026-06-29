import type { LeadGenerationStepKey } from "@/types";

export const leadGenerationStepLabels: Record<LeadGenerationStepKey, string> = {
  normalizeInput: "Normalize input",
  generateKeywords: "Generate keywords",
  searchCustomersByProduct: "Search customers by product",
  extractCompanyDetails: "Extract company details",
  enrichCompanies: "Enrich companies",
  discoverWebsite: "Discover website",
  discoverContacts: "Discover contacts",
  mergeEvidence: "Merge evidence",
  searchEmailsByDomain: "Search emails by domain",
  discoverWhatsappAndContacts: "Discover WhatsApp and contacts",
  scoreBuyerFit: "Score Buyer Fit",
  generateEmailDraft: "Generate email draft",
  saveToCrm: "Save to CRM",
  humanApproveKeywords: "Human approve keywords",
  humanApproveEmail: "Human approve email",
  saveEmailDraft: "Save email draft"
};

export const leadGenerationStepOrder: LeadGenerationStepKey[] = [
  "normalizeInput",
  "generateKeywords",
  "humanApproveKeywords",
  "searchCustomersByProduct",
  "extractCompanyDetails",
  "enrichCompanies",
  "discoverWebsite",
  "discoverContacts",
  "mergeEvidence",
  "scoreBuyerFit",
  "generateEmailDraft",
  "humanApproveEmail",
  "saveToCrm"
];
