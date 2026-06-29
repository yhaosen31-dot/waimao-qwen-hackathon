const COMPANY_SUFFIX_PATTERN =
  /\b(co\.?\s*,?\s*ltd\.?|company\s+limited|limited|ltd\.?|incorporated|inc\.?|llc|gmbh|s\.?\s*a\.?|sarl|pte\.?\s*ltd\.?|plc|corp\.?|corporation|bv|b\.?\s*v\.?|ag)\b/gi;

export function cleanCompanyName(value: string | undefined | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeCompanyName(value: string | undefined | null) {
  return cleanCompanyName(value)
    .toUpperCase()
    .replace(/[，,.;:()（）[\]{}'"“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompanyNameForDedupe(value: string | undefined | null) {
  return normalizeCompanyName(value)
    .replace(COMPANY_SUFFIX_PATTERN, " ")
    .replace(/\b(CO|COMPANY)\b$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCountry(value: string | undefined | null) {
  return cleanCompanyName(value);
}

export function buildRawDataSummary(rawData: Record<string, string>) {
  return Object.entries(rawData)
    .filter(([, value]) => value.trim().length > 0)
    .slice(0, 12)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");
}
