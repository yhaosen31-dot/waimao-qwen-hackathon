// Disabled legacy connector: retained for reference only. Current providers and APIs must not import or run this module.
import type { Page } from "playwright";
import { ensureCrossSearchPage, getCrossSearchSession } from "@/browser/crossSearch/session";
import type { CrossSearchSessionCheckResult } from "@/browser/crossSearch/types";

const LOGIN_URL_PATTERNS = [/login/i, /signin/i, /passport/i, /account/i];
const LOGGED_IN_URL_PATTERNS = [/\/Home\/Desktop/i, /\/Desktop/i, /\/OneSearch/i, /\/Home\/Index/i];
const LOGGED_IN_TEXT_MARKERS = ["工作台", "桌面", "后台", "退出", "一键搜", "客户", "会员中心"];
const LOGIN_TEXT_MARKERS = ["登录", "账号", "用户名", "手机号", "密码", "忘记密码"];
const HUMAN_CHALLENGE_MARKERS = [
  "验证码",
  "二维码",
  "短信验证",
  "手机验证",
  "滑块",
  "拖动",
  "人机验证",
  "安全验证",
  "captcha",
  "qr code",
  "sms verification"
];
const LOGIN_FORM_SELECTORS = [
  'input[type="password"]',
  'input[name*="password" i]',
  'input[id*="password" i]',
  'input[placeholder*="密码"]',
  'input[placeholder*="账号"]',
  'input[placeholder*="用户名"]',
  'input[placeholder*="手机"]',
  'button:has-text("登录")',
  'button:has-text("登 录")',
  'a:has-text("登录")'
];
const HUMAN_CHALLENGE_SELECTORS = [
  'iframe[src*="captcha" i]',
  'iframe[src*="verify" i]',
  'iframe[src*="sms" i]',
  'iframe[src*="qr" i]',
  '[class*="captcha" i]',
  '[id*="captcha" i]',
  '[class*="verify" i]',
  '[id*="verify" i]',
  '[class*="qrcode" i]',
  '[id*="qrcode" i]',
  'img[src*="qr" i]',
  'canvas'
];

export async function checkCrossSearchLogin(): Promise<CrossSearchSessionCheckResult> {
  const session = await getCrossSearchSession();
  const page = await ensureCrossSearchPage(session);

  await page.goto(session.config.baseUrl, {
    timeout: session.config.timeoutMs,
    waitUntil: "domcontentloaded"
  });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

  return inspectCrossSearchPage(page);
}

export async function inspectCrossSearchPage(page: Page): Promise<CrossSearchSessionCheckResult> {
  const currentUrl = page.url();
  const title = await page.title().catch(() => undefined);
  const bodyText = await readBodyText(page);
  const normalizedText = normalizeText(`${title ?? ""} ${bodyText}`);
  const isLoginUrl = LOGIN_URL_PATTERNS.some((pattern) => pattern.test(currentUrl));
  const isLoggedInUrl = LOGGED_IN_URL_PATTERNS.some((pattern) => pattern.test(currentUrl));
  const hasLoggedInMarker = LOGGED_IN_TEXT_MARKERS.some((marker) => normalizedText.includes(marker));
  const hasLoginMarker = LOGIN_TEXT_MARKERS.some((marker) => normalizedText.includes(marker));
  const hasHumanChallenge = HUMAN_CHALLENGE_MARKERS.some((marker) =>
    normalizedText.includes(marker.toLowerCase())
  );
  const hasLoginForm = await hasVisibleSelector(page, LOGIN_FORM_SELECTORS);
  const hasHumanChallengeElement =
    hasHumanChallenge || (await hasVisibleSelector(page, HUMAN_CHALLENGE_SELECTORS));

  if (hasHumanChallengeElement) {
    return {
      loggedIn: false,
      requiresHuman: true,
      currentUrl,
      title,
      reason: "Detected captcha, QR code, SMS, or other human verification."
    };
  }

  if (isLoginUrl || hasLoginMarker || hasLoginForm) {
    return {
      loggedIn: false,
      requiresHuman: true,
      currentUrl,
      title,
      reason: "Detected login page or credential form."
    };
  }

  if (hasLoggedInMarker && isLoggedInUrl) {
    return {
      loggedIn: true,
      requiresHuman: false,
      currentUrl,
      title,
      reason: "Detected cross-search desktop/workbench URL and logged-in page markers."
    };
  }

  if (hasLoggedInMarker) {
    return {
      loggedIn: true,
      requiresHuman: false,
      currentUrl,
      title,
      reason: "Detected logged-in workbench markers on the page."
    };
  }

  return {
    loggedIn: false,
    requiresHuman: true,
    currentUrl,
    title,
    reason: "Unable to confidently identify login state; human confirmation is required."
  };
}

export async function detectHumanChallenge(page: Page) {
  const bodyText = normalizeText(await readBodyText(page));
  const textMatched = HUMAN_CHALLENGE_MARKERS.some((marker) => bodyText.includes(marker.toLowerCase()));

  return textMatched || (await hasVisibleSelector(page, HUMAN_CHALLENGE_SELECTORS));
}

async function readBodyText(page: Page) {
  return page
    .locator("body")
    .innerText({ timeout: 3_000 })
    .catch(() => "");
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 8_000).toLowerCase();
}

async function hasVisibleSelector(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count > 0 && (await locator.isVisible().catch(() => false))) {
      return true;
    }
  }

  return false;
}
