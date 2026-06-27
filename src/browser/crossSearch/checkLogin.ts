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

  if (isLoggedInUrl && !isLoginUrl && (hasLoggedInMarker || !hasLoginMarker)) {
    return {
      loggedIn: true,
      requiresHuman: false,
      currentUrl,
      title,
      reason: "Detected cross-search desktop/workbench URL."
    };
  }

  if (hasLoggedInMarker && !hasLoginMarker) {
    return {
      loggedIn: true,
      requiresHuman: false,
      currentUrl,
      title,
      reason: "Detected logged-in workbench markers on the page."
    };
  }

  if (hasHumanChallenge) {
    return {
      loggedIn: false,
      requiresHuman: true,
      currentUrl,
      title,
      reason: "Detected captcha, QR code, SMS, or other human verification."
    };
  }

  if (isLoginUrl || hasLoginMarker) {
    return {
      loggedIn: false,
      requiresHuman: true,
      currentUrl,
      title,
      reason: "Detected login page or credential form."
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
  const challengeFrameCount = await page
    .locator('iframe[src*="captcha"], iframe[src*="verify"], iframe[src*="sms"], iframe[src*="qr"]')
    .count()
    .catch(() => 0);

  return textMatched || challengeFrameCount > 0;
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
