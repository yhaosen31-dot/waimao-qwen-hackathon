import path from "node:path";
import type { CrossSearchConfig } from "@/browser/crossSearch/types";

const DEFAULT_BASE_URL = "https://vip.dqxx.com.cn/Home/Desktop";
const DEFAULT_ONE_SEARCH_URL = "https://vip.dqxx.com.cn/OneSearch/Home";
const DEFAULT_PROFILE_DIR = ".playwright/cross-search-profile";
const DEFAULT_TIMEOUT_MS = 30_000;

export function getCrossSearchConfig(): CrossSearchConfig {
  const profileDir = process.env.CROSS_SEARCH_PROFILE_DIR?.trim() || DEFAULT_PROFILE_DIR;
  const timeoutMs = Number(process.env.CROSS_SEARCH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  return {
    baseUrl: process.env.CROSS_SEARCH_BASE_URL?.trim() || DEFAULT_BASE_URL,
    oneSearchUrl: process.env.CROSS_SEARCH_ONE_SEARCH_URL?.trim() || DEFAULT_ONE_SEARCH_URL,
    username: process.env.CROSS_SEARCH_USERNAME?.trim() || undefined,
    password: process.env.CROSS_SEARCH_PASSWORD?.trim() || undefined,
    headless: parseBooleanEnv(process.env.CROSS_SEARCH_HEADLESS, false),
    profileDir: path.isAbsolute(profileDir)
      ? profileDir
      : path.resolve(/* turbopackIgnore: true */ process.cwd(), profileDir),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  };
}

export function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
