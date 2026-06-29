import { extractDomain } from "@/services/domainNormalizeService";

export type EmailQuality = "high" | "medium" | "low";

export function normalizeEmail(value: string | undefined | null) {
  const email = (value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return "";
  if (/^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster)@/i.test(email)) return "";
  if (/^(test|example|sample|yourname|name|email|user|username)@/i.test(email)) return "";
  if (/@(example|domain|email|test)\./i.test(email)) return "";
  return email;
}

export function classifyEmail(email: string): EmailQuality {
  const localPart = email.split("@")[0] ?? "";

  if (
    /^(purchase|purchasing|procurement|sourcing|buyer|buying|compras|supply[._-]?chain|import|imports)([._-]|$)/i.test(
      localPart
    )
  ) {
    return "high";
  }
  if (
    /^(sales|sale|export|exports|info|contact|hello|office|admin|enquiry|enquiries|inquiry|ventas|commercial)([._-]|$)/i.test(
      localPart
    )
  ) {
    return isFreeEmailDomain(email) ? "low" : "medium";
  }
  if (/^(support|hr|jobs|career|careers|privacy|legal|webmaster|marketing|press|media)([._-]|$)/i.test(localPart)) return "low";
  if (isFreeEmailDomain(email)) return "low";
  return "medium";
}

export function normalizePhoneNumber(value: string | undefined | null, country?: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 7) return "";
  if (/(\d)\1{6,}/.test(digits)) return "";
  if (/^(1234567|0123456)/.test(digits)) return "";

  const countryCode = guessCountryCode(country);
  if (hasPlus) return `+${digits}`;
  if (countryCode && !digits.startsWith(countryCode)) return `+${countryCode}${digits}`;
  return digits.length >= 10 ? `+${digits}` : digits;
}

export function normalizeWhatsappNumber(value: string | undefined | null, country?: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";

  const fromUrl = numberFromWhatsappUrl(trimmed);
  const rawNumber = fromUrl || trimmed;
  const hasExplicitInternationalPrefix = /^\s*(?:\+|00)/.test(rawNumber);
  let digits = rawNumber.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/(\d)\1{6,}/.test(digits)) return "";
  if (/^(1234567|0123456)/.test(digits)) return "";

  if (hasExplicitInternationalPrefix) {
    return isValidE164Digits(digits) ? `+${digits}` : "";
  }

  const rule = guessCountryDialRule(country);
  if (rule) {
    if (digits.startsWith(rule.code) && isValidE164Digits(digits)) {
      return `+${digits}`;
    }

    let localDigits = digits;
    if (rule.stripLeadingZero) localDigits = localDigits.replace(/^0+/, "");
    if (rule.localPattern.test(localDigits)) return `+${rule.code}${localDigits}`;
  }

  if (startsWithKnownCountryCode(digits) && isValidE164Digits(digits)) {
    return `+${digits}`;
  }

  return "";
}

export function phoneCountryCode(value: string) {
  const match = value.match(/^\+(\d{1,3})/);
  return match?.[1];
}

export function isExplicitWhatsappSource(text: string | undefined | null, url?: string) {
  return /whatsapp|wa\.me|api\.whatsapp\.com/i.test(`${text ?? ""} ${url ?? ""}`);
}

export function emailDomainMatchesWebsite(email: string, website: string | undefined) {
  const domain = email.split("@")[1];
  return Boolean(domain && website && extractDomain(website) === domain.toLowerCase());
}

export function emailDomainMatchesSource(email: string, sourceUrl: string | undefined) {
  const domain = email.split("@")[1];
  return Boolean(domain && sourceUrl && extractDomain(sourceUrl) === domain.toLowerCase());
}

export function isFreeEmailDomain(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  return [
    "gmail.com",
    "googlemail.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "msn.com",
    "yahoo.com",
    "ymail.com",
    "aol.com",
    "icloud.com",
    "me.com",
    "proton.me",
    "protonmail.com",
    "qq.com",
    "163.com",
    "126.com",
    "foxmail.com"
  ].includes(domain);
}

function guessCountryCode(country?: string) {
  return guessCountryDialRule(country)?.code ?? "";
}

interface CountryDialRule {
  code: string;
  localPattern: RegExp;
  stripLeadingZero?: boolean;
}

function guessCountryDialRule(country?: string): CountryDialRule | undefined {
  const normalized = normalizeCountryName(country);
  if (!normalized) return undefined;

  const countryDialRules: Record<string, CountryDialRule> = {
    "united states": { code: "1", localPattern: /^\d{10}$/ },
    usa: { code: "1", localPattern: /^\d{10}$/ },
    us: { code: "1", localPattern: /^\d{10}$/ },
    美国: { code: "1", localPattern: /^\d{10}$/ },
    canada: { code: "1", localPattern: /^\d{10}$/ },
    加拿大: { code: "1", localPattern: /^\d{10}$/ },
    mexico: { code: "52", localPattern: /^\d{10}$/ },
    墨西哥: { code: "52", localPattern: /^\d{10}$/ },
    brazil: { code: "55", localPattern: /^\d{10,11}$/ },
    巴西: { code: "55", localPattern: /^\d{10,11}$/ },
    germany: { code: "49", localPattern: /^\d{10,12}$/, stripLeadingZero: true },
    德国: { code: "49", localPattern: /^\d{10,12}$/, stripLeadingZero: true },
    france: { code: "33", localPattern: /^[67]\d{8}$/, stripLeadingZero: true },
    法国: { code: "33", localPattern: /^[67]\d{8}$/, stripLeadingZero: true },
    italy: { code: "39", localPattern: /^3\d{8,9}$/ },
    意大利: { code: "39", localPattern: /^3\d{8,9}$/ },
    spain: { code: "34", localPattern: /^[67]\d{8}$/ },
    西班牙: { code: "34", localPattern: /^[67]\d{8}$/ },
    "united kingdom": { code: "44", localPattern: /^7\d{9}$/, stripLeadingZero: true },
    uk: { code: "44", localPattern: /^7\d{9}$/, stripLeadingZero: true },
    英国: { code: "44", localPattern: /^7\d{9}$/, stripLeadingZero: true },
    india: { code: "91", localPattern: /^[6-9]\d{9}$/ },
    印度: { code: "91", localPattern: /^[6-9]\d{9}$/ },
    japan: { code: "81", localPattern: /^[789]0\d{8}$/, stripLeadingZero: true },
    日本: { code: "81", localPattern: /^[789]0\d{8}$/, stripLeadingZero: true },
    korea: { code: "82", localPattern: /^10\d{8}$/, stripLeadingZero: true },
    "south korea": { code: "82", localPattern: /^10\d{8}$/, stripLeadingZero: true },
    韩国: { code: "82", localPattern: /^10\d{8}$/, stripLeadingZero: true },
    australia: { code: "61", localPattern: /^4\d{8}$/, stripLeadingZero: true },
    澳大利亚: { code: "61", localPattern: /^4\d{8}$/, stripLeadingZero: true },
    china: { code: "86", localPattern: /^1[3-9]\d{9}$/ },
    中国: { code: "86", localPattern: /^1[3-9]\d{9}$/ },
    singapore: { code: "65", localPattern: /^[689]\d{7}$/ },
    新加坡: { code: "65", localPattern: /^[689]\d{7}$/ },
    malaysia: { code: "60", localPattern: /^1\d{8,9}$/, stripLeadingZero: true },
    马来西亚: { code: "60", localPattern: /^1\d{8,9}$/, stripLeadingZero: true },
    thailand: { code: "66", localPattern: /^[689]\d{8}$/, stripLeadingZero: true },
    泰国: { code: "66", localPattern: /^[689]\d{8}$/, stripLeadingZero: true },
    vietnam: { code: "84", localPattern: /^[35789]\d{8}$/, stripLeadingZero: true },
    越南: { code: "84", localPattern: /^[35789]\d{8}$/, stripLeadingZero: true },
    indonesia: { code: "62", localPattern: /^8\d{8,11}$/, stripLeadingZero: true },
    印度尼西亚: { code: "62", localPattern: /^8\d{8,11}$/, stripLeadingZero: true },
    turkey: { code: "90", localPattern: /^5\d{9}$/, stripLeadingZero: true },
    土耳其: { code: "90", localPattern: /^5\d{9}$/, stripLeadingZero: true },
    "united arab emirates": { code: "971", localPattern: /^5\d{8}$/, stripLeadingZero: true },
    uae: { code: "971", localPattern: /^5\d{8}$/, stripLeadingZero: true },
    阿联酋: { code: "971", localPattern: /^5\d{8}$/, stripLeadingZero: true },
    "saudi arabia": { code: "966", localPattern: /^5\d{8}$/, stripLeadingZero: true },
    沙特阿拉伯: { code: "966", localPattern: /^5\d{8}$/, stripLeadingZero: true },
    philippines: { code: "63", localPattern: /^9\d{9}$/, stripLeadingZero: true },
    菲律宾: { code: "63", localPattern: /^9\d{9}$/, stripLeadingZero: true },
    peru: { code: "51", localPattern: /^9\d{8}$/ },
    秘鲁: { code: "51", localPattern: /^9\d{8}$/ },
    colombia: { code: "57", localPattern: /^3\d{9}$/ },
    哥伦比亚: { code: "57", localPattern: /^3\d{9}$/ },
    "costa rica": { code: "506", localPattern: /^[5678]\d{7}$/ },
    哥斯达黎加: { code: "506", localPattern: /^[5678]\d{7}$/ },
    ecuador: { code: "593", localPattern: /^9\d{8}$/, stripLeadingZero: true },
    厄瓜多尔: { code: "593", localPattern: /^9\d{8}$/, stripLeadingZero: true },
    chile: { code: "56", localPattern: /^9\d{8}$/ },
    智利: { code: "56", localPattern: /^9\d{8}$/ }
  };

  return countryDialRules[normalized];
}

function normalizeCountryName(country?: string) {
  return (country ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function numberFromWhatsappUrl(value: string) {
  try {
    const url = value.startsWith("whatsapp://")
      ? new URL(value.replace(/^whatsapp:\/\//i, "https://whatsapp.local/"))
      : new URL(value);
    const phoneParam = url.searchParams.get("phone");
    if (phoneParam) return phoneParam;
    if (/wa\.me/i.test(url.hostname)) return url.pathname.split("/").filter(Boolean)[0] ?? "";
  } catch {
    const phoneMatch = value.match(/[?&]phone=([+\d\s().-]+)/i);
    if (phoneMatch?.[1]) return phoneMatch[1];
    const waMatch = value.match(/wa\.me\/([+\d\s().-]+)/i);
    if (waMatch?.[1]) return waMatch[1];
  }

  return "";
}

function isValidE164Digits(digits: string) {
  return digits.length >= 10 && digits.length <= 15;
}

function startsWithKnownCountryCode(digits: string) {
  const knownCodes = [
    "1",
    "33",
    "34",
    "39",
    "44",
    "49",
    "51",
    "52",
    "55",
    "56",
    "57",
    "60",
    "61",
    "62",
    "63",
    "65",
    "66",
    "81",
    "82",
    "84",
    "86",
    "90",
    "91",
    "506",
    "593",
    "966",
    "971"
  ];

  return knownCodes.some((code) => digits.startsWith(code));
}
