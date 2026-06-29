const DISABLED_MESSAGE =
  "Cross search connector is disabled because account risk control was detected.";

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
  source: "cross-search-disabled";
}

export interface CrossSearchDisabledResult {
  enabled: false;
  mode: "disabled";
  ok?: true;
  loggedIn: false;
  requiresHuman: false;
  success?: false;
  configuredAccount?: false;
  message: string;
  reason?: string;
}

export interface CrossSearchProviderStatus {
  enabled: false;
  mode: "disabled";
  configured: false;
  hasUsername: false;
  hasPassword: false;
  hasCredentials: false;
  headless: false;
  profileDir: "";
  baseUrl: "";
  oneSearchUrl: "";
  message: string;
}

export type CrossSearchProvider = {
  name: "cross-search";
  mode: "disabled";
  isConfigured: false;
  invoke(input: CrossSearchInput): Promise<CrossSearchImporter[]>;
  checkSession(): Promise<CrossSearchDisabledResult>;
  prepareLogin(): Promise<CrossSearchDisabledResult>;
  searchImportersByKeyword(): Promise<CrossSearchDisabledResult>;
  getImporterDetail(): Promise<CrossSearchDisabledResult>;
  status(): CrossSearchProviderStatus;
};

export function createCrossSearchProvider(): CrossSearchProvider {
  return {
    name: "cross-search",
    mode: "disabled",
    isConfigured: false,
    async invoke() {
      throw new Error(DISABLED_MESSAGE);
    },
    async checkSession() {
      return disabledResult();
    },
    async prepareLogin() {
      return {
        ...disabledResult(),
        success: false
      };
    },
    async searchImportersByKeyword() {
      return disabledResult();
    },
    async getImporterDetail() {
      return disabledResult();
    },
    status() {
      return {
        enabled: false,
        mode: "disabled",
        configured: false,
        hasUsername: false,
        hasPassword: false,
        hasCredentials: false,
        headless: false,
        profileDir: "",
        baseUrl: "",
        oneSearchUrl: "",
        message: DISABLED_MESSAGE
      };
    }
  };
}

function disabledResult(): CrossSearchDisabledResult {
  return {
    enabled: false,
    mode: "disabled",
    loggedIn: false,
    requiresHuman: false,
    configuredAccount: false,
    message: DISABLED_MESSAGE
  };
}

export const crossSearchProvider = createCrossSearchProvider();
