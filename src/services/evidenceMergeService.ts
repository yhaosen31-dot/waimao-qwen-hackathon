import type {
  ContactDiscoveryResult,
  EmailCandidate,
  PhoneCandidate,
  SocialCandidate
} from "@/services/contactDiscoveryService";
import type { WebsiteDiscoveryResult } from "@/services/websiteDiscoveryService";
import {
  classifyEmail,
  emailDomainMatchesSource,
  emailDomainMatchesWebsite,
  isFreeEmailDomain
} from "@/services/contactNormalizeService";

export interface MergedEvidenceResult {
  primaryWebsite?: string;
  primaryDomain?: string;
  recommendedEmails: string[];
  recommendedPhone?: string;
  recommendedWhatsapp?: string;
  recommendedSocialLinks: {
    linkedin?: string;
    facebook?: string;
  };
  contactConfidence: number;
  evidenceSummary: string;
  needsReview: boolean;
}

export function mergeCompanyEvidence(input: {
  website: WebsiteDiscoveryResult;
  contacts: ContactDiscoveryResult;
}): MergedEvidenceResult {
  const primaryWebsite = input.website.website;
  const primaryDomain = input.website.domain;
  const rankedEmails = rankEmails(input.contacts.emails, primaryWebsite);
  const rankedPhones = rankPhones(input.contacts.phones);
  const rankedWhatsapps = rankPhones(input.contacts.whatsappNumbers);
  const socialLinks = pickSocialLinks(input.contacts.socials);
  const confidenceInputs = [
    input.website.confidence,
    rankedEmails[0]?.confidence ?? 0,
    rankedPhones[0]?.confidence ?? 0,
    rankedWhatsapps[0]?.confidence ?? 0,
    ...Object.values(socialLinks)
      .filter((link): link is SocialCandidate => Boolean(link))
      .map((link) => link.confidence)
  ].filter((value) => value > 0);
  const contactConfidence =
    confidenceInputs.length > 0
      ? Math.round(
          (confidenceInputs.reduce((sum, value) => sum + value, 0) / confidenceInputs.length) * 100
        )
      : 0;
  const needsReview = input.website.needsReview || contactConfidence > 0 && contactConfidence < 55;

  return {
    primaryWebsite,
    primaryDomain,
    recommendedEmails: rankedEmails.slice(0, 3).map((candidate) => candidate.email),
    recommendedPhone: rankedPhones[0]?.number,
    recommendedWhatsapp: rankedWhatsapps[0]?.number,
    recommendedSocialLinks: {
      linkedin: socialLinks.linkedin?.url,
      facebook: socialLinks.facebook?.url
    },
    contactConfidence,
    evidenceSummary: buildEvidenceSummary({
      websiteFound: Boolean(primaryWebsite),
      emailCount: rankedEmails.length,
      phoneCount: rankedPhones.length,
      whatsappCount: rankedWhatsapps.length,
      socialCount: Object.keys(socialLinks).length,
      needsReview
    }),
    needsReview
  };
}

function rankEmails(emails: EmailCandidate[], website?: string) {
  return [...emails]
    .map((candidate) => ({
      ...candidate,
      confidence: Math.min(
        0.99,
        candidate.confidence +
          (emailDomainMatchesWebsite(candidate.email, website) ? 0.12 : 0) +
          (emailDomainMatchesSource(candidate.email, candidate.sourceUrl) ? 0.08 : 0) +
          (classifyEmail(candidate.email) === "high" ? 0.08 : 0) -
          (classifyEmail(candidate.email) === "low" ? 0.16 : 0) -
          (isFreeEmailDomain(candidate.email) ? 0.18 : 0)
      )
    }))
    .filter((candidate) => {
      const quality = classifyEmail(candidate.email);
      if (candidate.confidence < 0.5) return false;
      if (quality === "low" && candidate.confidence < 0.72) return false;
      if (isFreeEmailDomain(candidate.email) && candidate.confidence < 0.78) return false;
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence);
}

function rankPhones(phones: PhoneCandidate[]) {
  return [...phones].sort((a, b) => b.confidence - a.confidence);
}

function pickSocialLinks(socials: SocialCandidate[]) {
  return socials
    .sort((a, b) => b.confidence - a.confidence)
    .reduce<Record<"linkedin" | "facebook", SocialCandidate | undefined>>(
      (links, candidate) => ({
        ...links,
        [candidate.type]: links[candidate.type] ?? candidate
      }),
      {
        linkedin: undefined,
        facebook: undefined
      }
    );
}

function buildEvidenceSummary(input: {
  websiteFound: boolean;
  emailCount: number;
  phoneCount: number;
  whatsappCount: number;
  socialCount: number;
  needsReview: boolean;
}) {
  const parts = [
    input.websiteFound ? "website found" : "website not found",
    `${input.emailCount} email(s)`,
    `${input.phoneCount} phone(s)`,
    `${input.whatsappCount} WhatsApp candidate(s)`,
    `${input.socialCount} social link(s)`
  ];

  if (input.needsReview) parts.push("needs review");
  return parts.join("; ");
}
