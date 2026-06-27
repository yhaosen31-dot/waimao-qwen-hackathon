import type {
  BuyerFitResult,
  CompanyDetails,
  ContactIntel,
  LeadGenerationProviders,
  NormalizedProduct,
  RawImporterLead
} from "@/server/integrations/types";
import type { LeadEmail } from "@/lib/types";
import { mockLeadCompanies } from "@/server/integrations/mock/mock-data";

const contactNames = [
  "Daniel Brooks",
  "Maja Lindstrom",
  "Carlos Rivera",
  "Priya Menon",
  "Thomas Weber",
  "Hannah Clarke",
  "Renata Costa",
  "Oliver Wright",
  "Noura Haddad",
  "Luis Ortega",
  "Kenji Sato",
  "Valeria Rojas",
  "Ethan Campbell",
  "Selin Kaya",
  "Piotr Nowak",
  "Julia Bauer",
  "Sipho Dlamini",
  "Minh Tran",
  "Kristjan Tamm",
  "Nikos Antoniou"
];

const contactTitles = [
  "Procurement Manager",
  "Sourcing Director",
  "Technical Purchasing Lead",
  "Import Manager",
  "Hydraulic Parts Buyer"
];

export const mockProviders: LeadGenerationProviders = {
  normalizer: {
    async normalize(input: string): Promise<NormalizedProduct> {
      const normalizedProduct = input
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

      return {
        normalizedProduct,
        productFamily: normalizedProduct.includes("accumulator")
          ? "hydraulic accumulator"
          : normalizedProduct,
        buyerIntent:
          "Find importers, distributors, repair houses, and industrial procurement teams with recurring replacement-parts demand."
      };
    }
  },

  keywordProvider: {
    async generateKeywords(product: NormalizedProduct): Promise<string[]> {
      const seed = product.normalizedProduct;
      const family = product.productFamily;

      return Array.from(
        new Set([
          seed,
          family,
          "diaphragm accumulator supplier",
          "hydraulic accumulator importer",
          "industrial hydraulic accumulator",
          "pressure accumulator for hydraulic system",
          "nitrogen charged diaphragm accumulator",
          "hydraulic spare parts distributor",
          "fluid power components importer",
          "mobile machinery hydraulic accumulator"
        ])
      );
    }
  },

  importerSearch: {
    async searchImporters(keywords: string[], targetCount: number): Promise<RawImporterLead[]> {
      const leads = mockLeadCompanies.slice(0, targetCount).map((lead, index) => ({
        ...lead,
        source: `${lead.source} | query: ${keywords[index % keywords.length]}`
      }));

      return leads;
    }
  },

  companyEnrichment: {
    async extractDetails(leads: RawImporterLead[]): Promise<CompanyDetails[]> {
      return leads.map((lead, index) => {
        const website = lead.website ?? "";
        const domain = website ? domainFromWebsite(website) : "";

        return {
          ...lead,
          website,
          domain,
          annualImportEstimate: estimateImportVolume(index)
        };
      });
    }
  },

  websiteResolver: {
    async resolveMissingWebsites(companies: CompanyDetails[]): Promise<CompanyDetails[]> {
      return companies.map((company) => {
        if (company.website && company.domain) return company;

        const domain = mockDomain(company.companyName, company.country);

        return {
          ...company,
          website: `https://www.${domain}`,
          domain
        };
      });
    }
  },

  emailFinder: {
    async findEmails(company: CompanyDetails): Promise<LeadEmail[]> {
      const companyToken = company.companyName
        .split(/\s+/)
        .find((token) => /^[a-z]/i.test(token))
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const domain = company.domain;

      return [
        {
          address: `procurement@${domain}`,
          source: "domain_pattern",
          confidence: 0.9
        },
        {
          address: companyToken ? `${companyToken}@${domain}` : `sales@${domain}`,
          source: "mock_export_directory",
          confidence: 0.78
        }
      ];
    }
  },

  contactIntel: {
    async enrichContact(company: CompanyDetails): Promise<ContactIntel> {
      const index = stableIndex(company.companyName);
      const countryCode = countryDialCode(company.country);
      const localNumber = `${700000 + index * 137}`.padStart(7, "0");

      return {
        whatsapp: `+${countryCode}${localNumber}`,
        phone: `+${countryCode}${localNumber.slice(0, 3)} ${localNumber.slice(3)}`,
        contactName: contactNames[index % contactNames.length],
        contactTitle: contactTitles[index % contactTitles.length]
      };
    }
  },

  buyerFitScorer: {
    async score(company: CompanyDetails, keywords: string[]): Promise<BuyerFitResult> {
      const text = `${company.companyName} ${company.importerProfile} ${company.products.join(" ")}`.toLowerCase();
      const keywordHits = keywords.filter((keyword) => text.includes(keyword.split(" ")[0])).length;
      const productHits = company.products.filter((product) =>
        /accumulator|hydraulic|fluid|pressure/i.test(product)
      ).length;
      const base = 62 + productHits * 7 + Math.min(keywordHits, 4) * 3;
      const marketBonus = ["United States", "Germany", "United Arab Emirates", "Canada", "Australia"].includes(
        company.country
      )
        ? 7
        : 3;
      const score = Math.min(96, base + marketBonus + (company.website ? 4 : 0));

      return {
        score,
        reasons: [
          "Product line overlaps with hydraulic accumulator demand.",
          "Profile indicates recurring MRO or distribution purchasing.",
          `${company.country} market has accessible industrial import channels.`
        ]
      };
    }
  },

  mailDraftProvider: {
    async createDraft({ customer, normalizedProduct, keywords }) {
      const keywordLine = keywords.slice(0, 3).join(", ");

      return {
        subject: `Hydraulic accumulator supply for ${customer.companyName}`,
        body: [
          `Hi ${customer.contactName},`,
          "",
          `I noticed ${customer.companyName} supports ${customer.importerProfile.toLowerCase()}`,
          `We manufacture ${normalizedProduct} and related hydraulic accumulator parts for distributors and MRO teams that need stable replacement supply.`,
          "",
          `Based on your product focus around ${customer.products.join(", ")}, I thought our diaphragm accumulator line may be relevant. Typical search intents we support include ${keywordLine}.`,
          "",
          "Could I send a short catalog and check which pressure range, volume, and connection standard you usually purchase?",
          "",
          "Best regards,",
          "Export Sales Team"
        ].join("\n"),
        status: "draft",
        provider: "mock-resend",
        personalizationNotes: [
          `Matched products: ${customer.products.join(", ")}`,
          `Buyer fit score: ${customer.buyerFitScore}`,
          `Outreach channel: ${customer.emails[0]?.address ?? "domain email pending"}`
        ]
      };
    }
  },

  mailSender: {
    async saveDraft(draft) {
      return {
        ...draft,
        status: "draft"
      };
    }
  }
};

function domainFromWebsite(website: string) {
  return website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function mockDomain(companyName: string, country: string) {
  const slug = companyName
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 26);

  return `${slug}.${countryTld(country)}`;
}

function countryTld(country: string) {
  const map: Record<string, string> = {
    Australia: "com.au",
    Brazil: "com.br",
    Canada: "ca",
    Estonia: "ee",
    Germany: "de",
    Greece: "gr",
    Japan: "jp",
    Mexico: "mx",
    Peru: "pe",
    Poland: "pl",
    Singapore: "sg",
    Spain: "es",
    Sweden: "se",
    Turkey: "com.tr",
    "United Arab Emirates": "ae",
    "United Kingdom": "co.uk",
    "United States": "com",
    Vietnam: "vn",
    "South Africa": "co.za"
  };

  return map[country] ?? "com";
}

function countryDialCode(country: string) {
  const map: Record<string, string> = {
    Australia: "61",
    Brazil: "55",
    Canada: "1",
    Estonia: "372",
    Germany: "49",
    Greece: "30",
    Japan: "81",
    Mexico: "52",
    Peru: "51",
    Poland: "48",
    Singapore: "65",
    Spain: "34",
    Sweden: "46",
    Turkey: "90",
    "United Arab Emirates": "971",
    "United Kingdom": "44",
    "United States": "1",
    Vietnam: "84",
    "South Africa": "27"
  };

  return map[country] ?? "1";
}

function estimateImportVolume(index: number) {
  const estimates = [
    "$120k-$250k / year",
    "$250k-$500k / year",
    "$500k-$1.2m / year",
    "$80k-$180k / year"
  ];

  return estimates[index % estimates.length];
}

function stableIndex(value: string) {
  return value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}
