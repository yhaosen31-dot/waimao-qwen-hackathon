import { nanoid } from "nanoid";
import { fetchWithTimeout } from "@/providers/providerFetch";
import {
  isExplicitWhatsappSource,
  normalizeWhatsappNumber,
  phoneCountryCode
} from "@/services/contactNormalizeService";
import { extractDomain, normalizeWebsiteUrl, sameDomain } from "@/services/domainNormalizeService";

export interface PublicWhatsappDiscoveryInput {
  companyName: string;
  country?: string;
  website?: string;
  domain?: string;
}

export interface PublicWhatsappCandidate {
  number: string;
  countryCode?: string;
  confidence: number;
  sourceProvider: "website_search";
  sourceUrl: string;
  evidenceText: string;
  evidenceId: string;
}

export async function discoverPublicWebsiteWhatsapps(
  input: PublicWhatsappDiscoveryInput
): Promise<PublicWhatsappCandidate[]> {
  const seedUrls = buildSeedUrls(input);
  const visited = new Set<string>();
  const candidates: PublicWhatsappCandidate[] = [];

  for (const seedUrl of seedUrls) {
    if (visited.size >= 8) break;
    await scanUrl(seedUrl, input, visited, candidates);

    if (candidates.length >= 3) break;
  }

  return dedupeWhatsappCandidates(candidates).sort((a, b) => b.confidence - a.confidence);
}

async function scanUrl(
  url: string,
  input: PublicWhatsappDiscoveryInput,
  visited: Set<string>,
  candidates: PublicWhatsappCandidate[]
) {
  const normalizedUrl = normalizeWebsiteUrl(url);
  if (!normalizedUrl || visited.has(normalizedUrl)) return;
  visited.add(normalizedUrl);

  const html = await fetchHtml(normalizedUrl);
  if (!html) return;

  candidates.push(...extractWhatsappsFromHtml(html, normalizedUrl, input));

  if (visited.size >= 8 || candidates.length >= 3) return;

  for (const nextUrl of extractRelevantLinks(html, normalizedUrl)) {
    if (visited.size >= 8 || candidates.length >= 3) break;
    await scanUrl(nextUrl, input, visited, candidates);
  }
}

async function fetchHtml(url: string) {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; WaimaoAgent/1.0; +https://localhost/contact-discovery)",
          Accept: "text/html,application/xhtml+xml"
        }
      },
      10_000
    );

    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) return "";

    return (await response.text()).slice(0, 500_000);
  } catch {
    return "";
  }
}

function extractWhatsappsFromHtml(
  html: string,
  sourceUrl: string,
  input: PublicWhatsappDiscoveryInput
) {
  const decoded = decodeHtmlEntities(html);
  const text = htmlToText(decoded);
  const candidates: PublicWhatsappCandidate[] = [];

  for (const link of extractWhatsappLinks(decoded, sourceUrl)) {
    const number = normalizeWhatsappNumber(link.number, input.country);
    if (!number) continue;

    candidates.push({
      number,
      countryCode: phoneCountryCode(number),
      confidence: link.kind === "wa_link" ? 0.94 : 0.9,
      sourceProvider: "website_search",
      sourceUrl: link.url,
      evidenceText: `WhatsApp link found on ${sourceUrl}: ${link.url}`,
      evidenceId: `evidence_${nanoid(10)}`
    });
  }

  for (const textMatch of extractExplicitWhatsappText(text, input.country)) {
    candidates.push({
      number: textMatch.number,
      countryCode: phoneCountryCode(textMatch.number),
      confidence: 0.82,
      sourceProvider: "website_search",
      sourceUrl,
      evidenceText: textMatch.evidenceText,
      evidenceId: `evidence_${nanoid(10)}`
    });
  }

  return candidates.filter((candidate) =>
    isExplicitWhatsappSource(candidate.evidenceText, candidate.sourceUrl)
  );
}

function extractWhatsappLinks(html: string, sourceUrl: string) {
  const links: Array<{ number: string; url: string; kind: "wa_link" | "send_link" }> = [];
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = normalizeHref(match[1] ?? "", sourceUrl);
    if (!href || !/wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp:\/\//i.test(href)) {
      continue;
    }

    const number = numberFromWhatsappUrl(href);
    if (!number) continue;

    links.push({
      number,
      url: href,
      kind: /wa\.me/i.test(href) ? "wa_link" : "send_link"
    });
  }

  return links;
}

function numberFromWhatsappUrl(value: string) {
  try {
    const url = value.startsWith("whatsapp://")
      ? new URL(value.replace(/^whatsapp:\/\//i, "https://whatsapp.local/"))
      : new URL(value);
    const phoneParam = url.searchParams.get("phone");
    if (phoneParam) return phoneParam.replace(/[^\d+]/g, "");

    if (/wa\.me/i.test(url.hostname)) {
      const pathNumber = url.pathname.split("/").filter(Boolean)[0];
      return pathNumber?.replace(/[^\d+]/g, "") ?? "";
    }
  } catch {
    const phoneMatch = value.match(/[?&]phone=([+\d\s().-]+)/i);
    if (phoneMatch?.[1]) return phoneMatch[1].replace(/[^\d+]/g, "");
    const waMatch = value.match(/wa\.me\/([+\d\s().-]+)/i);
    if (waMatch?.[1]) return waMatch[1].replace(/[^\d+]/g, "");
  }

  return "";
}

function extractExplicitWhatsappText(text: string, country?: string) {
  const matches: Array<{ number: string; evidenceText: string }> = [];
  const pattern =
    /\b(?:whats\s*app|whatsapp|wa)[\s:：#-]{0,12}((?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){7,18})/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const rawNumber = match[1] ?? "";
    const number = normalizeWhatsappNumber(rawNumber, country);
    if (!number) continue;

    const start = Math.max(0, match.index - 80);
    const end = Math.min(text.length, match.index + match[0].length + 80);
    matches.push({
      number,
      evidenceText: text.slice(start, end).replace(/\s+/g, " ").trim()
    });
  }

  return matches;
}

function extractRelevantLinks(html: string, sourceUrl: string) {
  const links: string[] = [];
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = normalizeHref(match[1] ?? "", sourceUrl);
    if (!href || !sameDomain(href, sourceUrl)) continue;
    if (!/contact|about|whatsapp|support|sales|ventas|compras|contato|contacto/i.test(href)) {
      continue;
    }
    links.push(href);
  }

  return Array.from(new Set(links)).slice(0, 5);
}

function buildSeedUrls(input: PublicWhatsappDiscoveryInput) {
  const website = normalizeWebsiteUrl(input.website);
  const domain = input.domain || extractDomain(website);
  const base = website || (domain ? `https://${domain}` : "");
  if (!base) return [];

  const origin = originFromUrl(base);
  if (!origin) return [base];

  return [
    base,
    `${origin}/contact`,
    `${origin}/contact-us`,
    `${origin}/contacts`,
    `${origin}/about`,
    `${origin}/about-us`,
    `${origin}/contacto`,
    `${origin}/contato`
  ];
}

function originFromUrl(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function normalizeHref(href: string, baseUrl: string) {
  const trimmed = href.trim();
  if (!trimmed || /^(mailto:|tel:|javascript:|#)/i.test(trimmed)) return "";
  if (/^whatsapp:\/\//i.test(trimmed)) return trimmed;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return "";
  }
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function dedupeWhatsappCandidates(candidates: PublicWhatsappCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = candidate.number;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
