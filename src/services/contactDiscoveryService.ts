import { nanoid } from "nanoid";
import { contentModelProvider } from "@/providers/contentModelProvider";
import { searchProviderRouter, type SearchProviderAttempt } from "@/services/searchProviderRouter";
import { discoverPublicWebsiteWhatsapps } from "@/services/whatsappDiscoveryService";
import {
  classifyEmail,
  emailDomainMatchesSource,
  emailDomainMatchesWebsite,
  isExplicitWhatsappSource,
  isFreeEmailDomain,
  normalizeEmail,
  normalizePhoneNumber,
  normalizeWhatsappNumber,
  phoneCountryCode,
  type EmailQuality
} from "@/services/contactNormalizeService";
import { isThirdPartyDirectory } from "@/services/domainNormalizeService";
import type { ContactSearchResult, EvidenceProvider, SaveEvidenceInput, SearchProviderName } from "@/types";

type ContactEvidenceSourceProvider = SearchProviderName | "website_search";

export interface ContactDiscoveryInput {
  companyId: string;
  importJobId?: string;
  companyName: string;
  country?: string;
  website?: string;
  domain?: string;
}

export interface EmailCandidate {
  email: string;
  quality: EmailQuality;
  confidence: number;
  sourceProvider: SearchProviderName;
  sourceUrl: string;
  evidenceText: string;
  evidenceId: string;
}

export interface PhoneCandidate {
  number: string;
  countryCode?: string;
  confidence: number;
  sourceProvider: ContactEvidenceSourceProvider;
  sourceUrl: string;
  evidenceText: string;
  evidenceId: string;
}

export interface SocialCandidate {
  type: "linkedin" | "facebook";
  url: string;
  confidence: number;
  sourceProvider: SearchProviderName;
  sourceUrl: string;
  evidenceText: string;
  evidenceId: string;
}

export interface ContactDiscoveryResult {
  emails: EmailCandidate[];
  phones: PhoneCandidate[];
  whatsappNumbers: PhoneCandidate[];
  socials: SocialCandidate[];
  evidence: SaveEvidenceInput[];
  providerAttempts: SearchProviderAttempt[];
}

export async function discoverCompanyContacts(
  input: ContactDiscoveryInput
): Promise<ContactDiscoveryResult> {
  const contactQuery = `${input.companyName} email contact phone ${input.country ?? ""}`.trim();
  const [searchExecution, websiteWhatsappCandidates] = await Promise.all([
    runContactSearch(input, contactQuery),
    discoverPublicWebsiteWhatsapps(input)
  ]);
  const contactResults = searchExecution.contactResults.filter((result) => result.sourceProvider !== "mock");
  const providerAttempts = searchExecution.providerAttempts;

  const emails = dedupeByValue(
    contactResults.flatMap<EmailCandidate>((result) => {
      if (result.type !== "email" || !result.sourceUrl) return [];
      const email = normalizeEmail(result.value);
      if (!email) return [];

      const quality = classifyEmail(email);
      const confidence = adjustEmailConfidence(
        result.confidence,
        quality,
        input.website,
        email,
        result.sourceUrl,
        result.evidenceText
      );
      if (!shouldKeepEmailCandidate({ email, quality, confidence, sourceUrl: result.sourceUrl, website: input.website })) {
        return [];
      }

      return [
        {
          email,
          quality,
          confidence,
          sourceProvider: result.sourceProvider,
          sourceUrl: result.sourceUrl,
          evidenceText: result.evidenceText,
          evidenceId: `evidence_${nanoid(10)}`
        }
      ];
    }),
    (candidate) => candidate.email
  );
  const phones = dedupeByValue(
    contactResults.flatMap<PhoneCandidate>((result) => {
      if (result.type !== "phone" || !result.sourceUrl) return [];
      const number = normalizePhoneNumber(result.value, input.country);
      if (!number) return [];

      return [
        {
          number,
          countryCode: phoneCountryCode(number),
          confidence: Math.max(0.45, Math.min(0.95, result.confidence)),
          sourceProvider: result.sourceProvider,
          sourceUrl: result.sourceUrl,
          evidenceText: result.evidenceText,
          evidenceId: `evidence_${nanoid(10)}`
        }
      ];
    }),
    (candidate) => candidate.number
  );
  const whatsappNumbers = dedupeByValue(
    [
      ...websiteWhatsappCandidates,
      ...contactResults.flatMap<PhoneCandidate>((result) => {
        if (result.type !== "whatsapp" || !result.sourceUrl) return [];
        if (!isExplicitWhatsappSource(result.evidenceText, result.sourceUrl)) return [];

        const number = normalizeWhatsappNumber(result.value, input.country);
        if (!number) return [];

        return [
          {
            number,
            countryCode: phoneCountryCode(number),
            confidence: Math.max(0.55, Math.min(0.97, result.confidence + 0.05)),
            sourceProvider: result.sourceProvider,
            sourceUrl: result.sourceUrl,
            evidenceText: result.evidenceText,
            evidenceId: `evidence_${nanoid(10)}`
          }
        ];
      })
    ],
    (candidate) => candidate.number
  );
  const socials = dedupeByValue(
    contactResults.flatMap<SocialCandidate>((result) => {
      if ((result.type !== "linkedin" && result.type !== "facebook") || !result.sourceUrl) return [];

      return [
        {
          type: result.type,
          url: result.value,
          confidence: Math.max(0.5, Math.min(0.95, result.confidence)),
          sourceProvider: result.sourceProvider,
          sourceUrl: result.sourceUrl,
          evidenceText: result.evidenceText,
          evidenceId: `evidence_${nanoid(10)}`
        }
      ];
    }),
    (candidate) => `${candidate.type}:${candidate.url.toLowerCase()}`
  );
  const evidence: SaveEvidenceInput[] = [
    ...emails.map((candidate) => ({
      id: candidate.evidenceId,
      companyId: input.companyId,
      provider: candidate.sourceProvider as EvidenceProvider,
      sourceProvider: candidate.sourceProvider,
      type: "email_search" as const,
      source: candidate.sourceProvider,
      title: `Email candidate: ${candidate.email}`,
      url: candidate.sourceUrl,
      rawText: candidate.evidenceText,
      confidence: candidate.confidence,
      raw: {
        email: candidate.email,
        quality: candidate.quality,
        query: contactQuery,
        toolUse: searchExecution.toolUse
      }
    })),
    ...phones.map((candidate) => ({
      id: candidate.evidenceId,
      companyId: input.companyId,
      provider: sourceProviderToEvidenceProvider(candidate.sourceProvider),
      sourceProvider: searchProviderNameOrUndefined(candidate.sourceProvider),
      type: "phone_search" as const,
      source: candidate.sourceProvider,
      title: `Phone candidate: ${candidate.number}`,
      url: candidate.sourceUrl,
      rawText: candidate.evidenceText,
      confidence: candidate.confidence,
      raw: {
        phone: candidate.number,
        query: contactQuery,
        toolUse: searchExecution.toolUse
      }
    })),
    ...whatsappNumbers.map((candidate) => ({
      id: candidate.evidenceId,
      companyId: input.companyId,
      provider: sourceProviderToEvidenceProvider(candidate.sourceProvider),
      sourceProvider: searchProviderNameOrUndefined(candidate.sourceProvider),
      type: "whatsapp_search" as const,
      source: candidate.sourceProvider,
      title: `WhatsApp candidate: ${candidate.number}`,
      url: candidate.sourceUrl,
      rawText: candidate.evidenceText,
      confidence: candidate.confidence,
      raw: {
        whatsapp: candidate.number,
        explicitWhatsappSource: true,
        toolUse: searchExecution.toolUse
      }
    })),
    ...socials.map((candidate) => ({
      id: candidate.evidenceId,
      companyId: input.companyId,
      provider: candidate.sourceProvider as EvidenceProvider,
      sourceProvider: candidate.sourceProvider,
      type: "social_search" as const,
      source: candidate.sourceProvider,
      title: `${candidate.type} candidate`,
      url: candidate.sourceUrl,
      rawText: candidate.evidenceText,
      confidence: candidate.confidence,
      raw: {
        socialType: candidate.type,
        value: candidate.url,
        toolUse: searchExecution.toolUse
      }
    }))
  ];

  return {
    emails,
    phones,
    whatsappNumbers,
    socials,
    evidence,
    providerAttempts
  };
}

async function runContactSearch(input: ContactDiscoveryInput, contactQuery: string) {
  const contactResults: ContactSearchResult[] = [];
  const providerAttempts: SearchProviderAttempt[] = [];
  const toolSearch = await contentModelProvider.searchWithTools({
    objective:
      "Find public email, phone, WhatsApp, LinkedIn, and Facebook evidence for this company. Return only evidence from search_web results.",
    context: {
      companyName: input.companyName,
      country: input.country,
      website: input.website,
      domain: input.domain
    },
    defaultSearchType: "contact",
    mode: "fallback",
    companyId: input.companyId,
    importJobId: input.importJobId,
    maxToolCalls: 3,
    minResults: 1,
    minConfidence: 0.5
  });
  const toolContactResults = dedupeContacts(
    toolSearch.toolCalls.flatMap((call) => call.result.contactResults)
  );

  contactResults.push(...toolContactResults);
  providerAttempts.push(...toolSearch.toolCalls.flatMap((call) => call.result.attempts));

  for (const query of buildContactSearchQueries(input, contactQuery)) {
    if (hasEnoughContactEvidence(contactResults)) break;

    const routed = await searchProviderRouter.search({
      query: query.query,
      searchType: query.searchType,
      mode: "fallback",
      companyId: input.companyId,
      importJobId: input.importJobId,
      contactInput: {
        companyName: input.companyName,
        country: input.country,
        website: input.website
      },
      minResults: query.minResults,
      minConfidence: query.minConfidence
    });
    contactResults.push(...routed.contactResults);
    providerAttempts.push(...routed.attempts);
  }

  return {
    contactResults: dedupeContacts(contactResults),
    providerAttempts,
    toolUse: toolSearch.fallbackReason
      ? {
          provider: toolSearch.provider,
          toolQueries: toolSearch.toolCalls.map((call) => call.query),
          fallbackReason: toolSearch.fallbackReason
        }
      : undefined
  };
}

function adjustEmailConfidence(
  baseConfidence: number,
  quality: EmailQuality,
  website: string | undefined,
  email: string,
  sourceUrl?: string,
  evidenceText?: string
) {
  let confidence = baseConfidence;
  if (quality === "high") confidence += 0.16;
  if (quality === "low") confidence -= 0.2;
  if (emailDomainMatchesWebsite(email, website)) confidence += 0.16;
  if (emailDomainMatchesSource(email, sourceUrl)) confidence += 0.1;
  if (isFreeEmailDomain(email)) confidence -= 0.18;
  if (sourceUrl && isThirdPartyDirectory(sourceUrl)) confidence -= 0.12;
  if (/(procurement|purchase|purchasing|sourcing|compras|sales|export|contact)/i.test(evidenceText ?? "")) {
    confidence += 0.05;
  }
  return Math.max(0.2, Math.min(0.98, confidence));
}

function shouldKeepEmailCandidate(input: {
  email: string;
  quality: EmailQuality;
  confidence: number;
  sourceUrl?: string;
  website?: string;
}) {
  if (input.confidence < 0.42) return false;
  if (input.quality === "low" && input.confidence < 0.68) return false;
  if (isFreeEmailDomain(input.email) && input.confidence < 0.72) return false;
  if (input.sourceUrl && isThirdPartyDirectory(input.sourceUrl) && !emailDomainMatchesWebsite(input.email, input.website)) {
    return input.confidence >= 0.7;
  }
  return true;
}

function buildContactSearchQueries(input: ContactDiscoveryInput, contactQuery: string) {
  const domain = input.domain ?? domainFromWebsite(input.website);
  const base = [
    {
      query: contactQuery,
      searchType: "contact" as const,
      minResults: 1,
      minConfidence: 0.55
    },
    {
      query: `${input.companyName} procurement purchasing sourcing email ${input.country ?? ""}`.trim(),
      searchType: "email" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `${input.companyName} compras ventas email contacto ${input.country ?? ""}`.trim(),
      searchType: "email" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `${input.companyName} sales export contact email ${input.country ?? ""}`.trim(),
      searchType: "email" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `${input.companyName} WhatsApp contact ${input.country ?? ""}`.trim(),
      searchType: "whatsapp" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `${input.companyName} WhatsApp ventas compras ${input.country ?? ""}`.trim(),
      searchType: "whatsapp" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `${input.companyName} LinkedIn Facebook ${input.country ?? ""}`.trim(),
      searchType: "social" as const,
      minResults: 0,
      minConfidence: 0.5
    }
  ];

  if (!domain) return base;

  return [
    {
      query: `${domain} email contact`,
      searchType: "email" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    {
      query: `site:${domain} contact email`,
      searchType: "email" as const,
      minResults: 0,
      minConfidence: 0.5
    },
    ...base
  ];
}

function hasEnoughContactEvidence<T extends { type: string }>(contactResults: T[]) {
  const hasEmail = contactResults.some((result) => result.type === "email");
  const hasWhatsapp = contactResults.some((result) => result.type === "whatsapp");
  const hasSocial = contactResults.some((result) => result.type === "linkedin" || result.type === "facebook");

  return hasEmail && hasWhatsapp && hasSocial;
}

function domainFromWebsite(website?: string) {
  if (!website) return "";

  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function dedupeByValue<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeContacts<T extends { type: string; value: string }>(items: T[]) {
  return dedupeByValue(items, (item) => `${item.type}:${item.value.toLowerCase()}`);
}

function sourceProviderToEvidenceProvider(sourceProvider: ContactEvidenceSourceProvider): EvidenceProvider {
  return sourceProvider === "website_search" ? "website_search" : sourceProvider;
}

function searchProviderNameOrUndefined(
  sourceProvider: ContactEvidenceSourceProvider
): SearchProviderName | undefined {
  return sourceProvider === "website_search" ? undefined : sourceProvider;
}
