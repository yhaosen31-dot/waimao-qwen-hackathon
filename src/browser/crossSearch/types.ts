// Disabled legacy connector: retained for reference only. Current providers and APIs must not import or run this module.
export interface CrossSearchConfig {
  baseUrl: string;
  oneSearchUrl: string;
  username?: string;
  password?: string;
  headless: boolean;
  profileDir: string;
  timeoutMs: number;
}

export interface CrossSearchSessionCheckResult {
  loggedIn: boolean;
  requiresHuman: boolean;
  currentUrl?: string;
  title?: string;
  reason?: string;
}

export interface CrossSearchPrepareLoginResult {
  success: boolean;
  loggedIn: boolean;
  requiresHuman: boolean;
  message: string;
  currentUrl?: string;
  title?: string;
  reason?: string;
}

export interface CrossSearchProviderStatus {
  mode: "mock" | "real";
  configured: boolean;
  hasUsername: boolean;
  hasPassword: boolean;
  hasCredentials: boolean;
  headless: boolean;
  profileDir: string;
  baseUrl: string;
  oneSearchUrl: string;
}
