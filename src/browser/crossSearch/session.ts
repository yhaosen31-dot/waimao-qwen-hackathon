// Disabled legacy connector: retained for reference only. Current providers and APIs must not import or run this module.
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright";
import { getCrossSearchConfig } from "@/browser/crossSearch/config";
import type { CrossSearchConfig } from "@/browser/crossSearch/types";

const DISABLED_LEGACY_CONNECTOR =
  "Cross search Playwright connector is disabled because account risk control was detected.";

export interface CrossSearchBrowserSession {
  context: BrowserContext;
  page: Page;
  config: CrossSearchConfig;
  isClosed(): boolean;
  close(): Promise<void>;
}

let activeSession: CrossSearchBrowserSession | null = null;
let activeSessionPromise: Promise<CrossSearchBrowserSession> | null = null;

export async function createCrossSearchSession(
  overrides: Partial<CrossSearchConfig> = {}
): Promise<CrossSearchBrowserSession> {
  void overrides;
  throw new Error(DISABLED_LEGACY_CONNECTOR);

  const config = { ...getCrossSearchConfig(), ...overrides };
  await mkdir(config.profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(config.profileDir, {
    acceptDownloads: false,
    headless: config.headless,
    timeout: config.timeoutMs,
    viewport: { width: 1440, height: 960 }
  });

  context.setDefaultTimeout(config.timeoutMs);
  context.setDefaultNavigationTimeout(config.timeoutMs);

  let closed = false;
  context.on("close", () => {
    closed = true;
    if (activeSession?.context === context) {
      activeSession = null;
      activeSessionPromise = null;
    }
  });

  const page = context.pages().find((candidate) => !candidate.isClosed()) ?? (await context.newPage());

  return {
    context,
    page,
    config,
    isClosed() {
      return closed;
    },
    async close() {
      closed = true;
      await context.close().catch(() => undefined);
      if (activeSession?.context === context) {
        activeSession = null;
        activeSessionPromise = null;
      }
    }
  };
}

export async function getCrossSearchSession(): Promise<CrossSearchBrowserSession> {
  if (activeSession && !activeSession.isClosed()) {
    return activeSession;
  }

  if (!activeSessionPromise) {
    activeSessionPromise = createCrossSearchSession().then((session) => {
      activeSession = session;
      return session;
    });
  }

  return activeSessionPromise;
}

export async function ensureCrossSearchPage(session: CrossSearchBrowserSession) {
  if (session.page.isClosed()) {
    session.page = await session.context.newPage();
  }

  await session.page.bringToFront().catch(() => undefined);
  return session.page;
}

export async function closeCrossSearchSession() {
  if (activeSession && !activeSession.isClosed()) {
    await activeSession.close();
  }

  activeSession = null;
  activeSessionPromise = null;
}
