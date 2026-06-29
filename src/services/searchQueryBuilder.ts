export interface ProductSearchQueryPlanInput {
  productName: string;
  approvedKeywords: string[];
  targetCount: number;
  targetCountries?: string[];
}

export function buildProductSearchQueries(input: ProductSearchQueryPlanInput) {
  const seeds = dedupeStrings([input.productName, ...input.approvedKeywords])
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length >= 3)
    .slice(0, 8);
  const countries = input.targetCountries?.length
    ? input.targetCountries.map(countryNameForSearch).filter(Boolean)
    : [""];
  const buyerIntents = [
    "importer",
    "distributor",
    "dealer",
    "supplier contact",
    "buyer email",
    "official website",
    "whatsapp contact",
    "industrial company"
  ];
  const directQueries = countries.flatMap((country) => [
    `${input.productName} importer ${country}`.trim(),
    `${input.productName} distributor ${country}`.trim(),
    `${input.productName} supplier contact ${country}`.trim(),
    `${input.productName} buyer email ${country}`.trim(),
    `${input.productName} official website ${country}`.trim()
  ]);
  const expandedQueries = seeds.flatMap((seed) =>
    countries.flatMap((country) =>
      buyerIntents.slice(0, 6).map((intent) => `${seed} ${intent} ${country}`.trim())
    )
  );
  const maxQueries = Math.max(6, Math.min(10, Math.ceil(input.targetCount / 2)));

  return dedupeStrings([...directQueries, ...expandedQueries]).slice(0, maxQueries);
}

export function countryNameForSearch(country: string) {
  const normalized = country.trim().toLowerCase();
  return countrySearchNames[normalized] ?? country.trim();
}

export function matchesExcludedCountryText(text: string, excludedCountries: string[]) {
  if (excludedCountries.length === 0) return false;
  const normalizedText = text.toLowerCase();

  return excludedCountries.some((country) => {
    const normalized = country.trim().toLowerCase();
    const aliases = countryAliases[normalized] ?? [normalized];
    return aliases.some((alias) => alias && normalizedText.includes(alias));
  });
}

function dedupeStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

const countrySearchNames: Record<string, string> = {
  "\u7f8e\u56fd": "United States",
  usa: "United States",
  "u.s.": "United States",
  "united states": "United States",
  "\u5fb7\u56fd": "Germany",
  germany: "Germany",
  "\u58a8\u897f\u54e5": "Mexico",
  mexico: "Mexico",
  "\u52a0\u62ff\u5927": "Canada",
  canada: "Canada",
  "\u5df4\u897f": "Brazil",
  brazil: "Brazil",
  "\u79d8\u9c81": "Peru",
  peru: "Peru",
  "\u54e5\u4f26\u6bd4\u4e9a": "Colombia",
  colombia: "Colombia",
  "\u667a\u5229": "Chile",
  chile: "Chile",
  "\u82f1\u56fd": "United Kingdom",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  "\u6fb3\u5927\u5229\u4e9a": "Australia",
  australia: "Australia",
  "\u4e2d\u56fd": "China",
  china: "China",
  "\u4fc4\u7f57\u65af": "Russia",
  russia: "Russia",
  "\u4f0a\u6717": "Iran",
  iran: "Iran",
  "\u571f\u8033\u5176": "Turkey",
  turkey: "Turkey",
  "\u963f\u8054\u914b": "UAE",
  uae: "UAE",
  "\u8d8a\u5357": "Vietnam",
  vietnam: "Vietnam",
  "\u6cf0\u56fd": "Thailand",
  thailand: "Thailand"
};

const countryAliases: Record<string, string[]> = {
  "\u4e2d\u56fd": ["china", ".cn", "\u4e2d\u56fd"],
  china: ["china", ".cn", "\u4e2d\u56fd"],
  "\u4fc4\u7f57\u65af": ["russia", "russian", ".ru", "\u4fc4\u7f57\u65af"],
  russia: ["russia", "russian", ".ru", "\u4fc4\u7f57\u65af"],
  "\u4f0a\u6717": ["iran", "iranian", ".ir", "\u4f0a\u6717"],
  iran: ["iran", "iranian", ".ir", "\u4f0a\u6717"]
};
