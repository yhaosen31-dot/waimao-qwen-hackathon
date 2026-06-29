export function normalizeWebsiteUrl(value: string | undefined | null) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function extractDomain(value: string | undefined | null) {
  const website = normalizeWebsiteUrl(value);
  if (!website) return "";

  try {
    return new URL(website).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function domainMatchesCompany(domain: string, companyName: string) {
  const compactDomain = domain.split(".")[0]?.replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "";
  const companyTokens = companyName
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|llc|gmbh|co|company|corp|corporation)\b/g, " ")
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);

  if (!compactDomain || companyTokens.length === 0) return false;
  return companyTokens.some((token) => compactDomain.includes(token) || token.includes(compactDomain));
}

export function isThirdPartyDirectory(url: string | undefined | null) {
  const domain = extractDomain(url);

  return [
    "linkedin.com",
    "facebook.com",
    "alibaba.com",
    "made-in-china.com",
    "importgenius.com",
    "panjiva.com",
    "zoominfo.com",
    "dnb.com",
    "yellowpages.com",
    "kompass.com",
    "tradeindia.com",
    "globalsources.com"
  ].some((directoryDomain) => domain === directoryDomain || domain.endsWith(`.${directoryDomain}`));
}

export function sameDomain(left: string | undefined, right: string | undefined) {
  const leftDomain = extractDomain(left);
  const rightDomain = extractDomain(right);
  return Boolean(leftDomain && rightDomain && leftDomain === rightDomain);
}
