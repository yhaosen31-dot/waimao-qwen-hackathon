import {
  envFlag,
  type ExternalProvider,
  type ProviderMode,
  type ProviderFactoryOptions
} from "@/providers/types";
import { getCrossSearchConfig, parseBooleanEnv } from "@/browser/crossSearch/config";
import type {
  CrossSearchPrepareLoginResult,
  CrossSearchProviderStatus,
  CrossSearchSessionCheckResult
} from "@/browser/crossSearch/types";
import { mockLeadCompanies } from "@/server/integrations/mock/mock-data";

export interface CrossSearchInput {
  keywords: string[];
  targetCount: number;
}

export interface CrossSearchImporter {
  companyName: string;
  country: string;
  city: string;
  website?: string;
  products: string[];
  importerProfile: string;
  matchedKeyword: string;
  source: "mock-cross-search" | "cross-search";
}

export type CrossSearchProvider = ExternalProvider<CrossSearchInput, CrossSearchImporter[]> & {
  checkSession(): Promise<CrossSearchSessionCheckResult>;
  prepareLogin(): Promise<CrossSearchPrepareLoginResult>;
  status(): CrossSearchProviderStatus;
};

export function createCrossSearchProvider(options: ProviderFactoryOptions = {}): CrossSearchProvider {
  const realModeEnabled = parseBooleanEnv(process.env.CROSS_SEARCH_REAL_MODE, false);
  const mode: ProviderMode = options.mode ?? (realModeEnabled ? "real" : "mock");
  const config = getCrossSearchConfig();
  const hasUsername = envFlag(config.username);
  const hasPassword = envFlag(config.password);
  const isConfigured = mode === "real";

  return {
    name: "cross-search",
    mode,
    isConfigured,
    async invoke(input) {
      return mockLeadCompanies.slice(0, input.targetCount).map((lead, index) => ({
        companyName: lead.companyName,
        country: lead.country,
        city: lead.city,
        website: lead.website,
        products: lead.products,
        importerProfile: lead.importerProfile,
        matchedKeyword: input.keywords[index % Math.max(input.keywords.length, 1)] ?? "mock importer",
        source: "mock-cross-search"
      }));
    },
    async checkSession() {
      if (mode !== "real") {
        return {
          loggedIn: false,
          requiresHuman: false,
          currentUrl: config.baseUrl,
          title: "Cross Search mock mode",
          reason: "CROSS_SEARCH_REAL_MODE=false; skipped real Playwright browser session."
        };
      }

      const { checkCrossSearchLogin } = await import("@/browser/crossSearch/checkLogin");
      return checkCrossSearchLogin();
    },
    async prepareLogin() {
      if (mode !== "real") {
        return {
          success: true,
          loggedIn: false,
          requiresHuman: false,
          message: "Cross Search is in mock mode; no real login is required.",
          currentUrl: config.baseUrl,
          title: "Cross Search mock mode",
          reason: "CROSS_SEARCH_REAL_MODE=false; skipped real Playwright browser session."
        };
      }

      const { prepareCrossSearchLogin } = await import("@/browser/crossSearch/login");
      return prepareCrossSearchLogin();
    },
    status() {
      return {
        mode,
        configured: mode === "real",
        hasUsername,
        hasPassword,
        hasCredentials: hasUsername && hasPassword,
        headless: config.headless,
        profileDir: config.profileDir,
        baseUrl: config.baseUrl,
        oneSearchUrl: config.oneSearchUrl
      };
    }
  };
}

export const crossSearchProvider = createCrossSearchProvider();
