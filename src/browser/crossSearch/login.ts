import type { Page } from "playwright";
import { detectHumanChallenge, inspectCrossSearchPage } from "@/browser/crossSearch/checkLogin";
import { ensureCrossSearchPage, getCrossSearchSession } from "@/browser/crossSearch/session";
import type { CrossSearchPrepareLoginResult } from "@/browser/crossSearch/types";

const USERNAME_SELECTORS = [
  'input[name*="username" i]',
  'input[name*="user" i]',
  'input[name*="account" i]',
  'input[id*="username" i]',
  'input[id*="user" i]',
  'input[id*="account" i]',
  'input[placeholder*="账号"]',
  'input[placeholder*="用户名"]',
  'input[placeholder*="手机"]',
  'input[placeholder*="邮箱"]',
  'input[type="text"]',
  'input[type="tel"]',
  'input[type="email"]',
  "input:not([type])"
];

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name*="password" i]',
  'input[id*="password" i]',
  'input[placeholder*="密码"]'
];

const LOGIN_BUTTON_SELECTORS = [
  'button:has-text("登录")',
  'button:has-text("登 录")',
  'button[type="submit"]',
  'input[type="submit"]',
  'a:has-text("登录")',
  ".login-btn",
  ".btn-login",
  "#loginBtn"
];

export async function prepareCrossSearchLogin(): Promise<CrossSearchPrepareLoginResult> {
  const session = await getCrossSearchSession();
  const page = await ensureCrossSearchPage(session);

  await page.goto(session.config.baseUrl, {
    timeout: session.config.timeoutMs,
    waitUntil: "domcontentloaded"
  });
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

  const initialState = await inspectCrossSearchPage(page);
  if (initialState.loggedIn) {
    return {
      success: true,
      loggedIn: true,
      requiresHuman: false,
      message: "跨境搜登录态已存在。",
      currentUrl: initialState.currentUrl,
      title: initialState.title,
      reason: initialState.reason
    };
  }

  if (await detectHumanChallenge(page)) {
    return humanRequiredResult(page, "页面出现验证码、二维码、短信验证或人机验证，需要人工处理。");
  }

  const usernameSelector = await findVisibleSelector(page, USERNAME_SELECTORS);
  const passwordSelector = await findVisibleSelector(page, PASSWORD_SELECTORS);

  if (!usernameSelector || !passwordSelector) {
    return humanRequiredResult(page, "无法可靠识别账号密码登录入口，请在 Playwright 窗口人工登录。");
  }

  if (!session.config.username || !session.config.password) {
    return humanRequiredResult(page, "未配置跨境搜账号密码，请在 Playwright 窗口人工登录。");
  }

  await page.locator(usernameSelector).first().fill(session.config.username);
  await page.locator(passwordSelector).first().fill(session.config.password);

  if (await detectHumanChallenge(page)) {
    return humanRequiredResult(page, "填写账号密码后出现验证码、二维码、短信验证或人机验证，需要人工处理。");
  }

  const loginButtonSelector = await findVisibleSelector(page, LOGIN_BUTTON_SELECTORS);
  if (loginButtonSelector) {
    await page.locator(loginButtonSelector).first().click();
  } else {
    await page.locator(passwordSelector).first().press("Enter");
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);

  const afterLoginState = await inspectCrossSearchPage(page);
  if (afterLoginState.loggedIn) {
    return {
      success: true,
      loggedIn: true,
      requiresHuman: false,
      message: "跨境搜账号密码登录成功，登录态已写入本地 profile。",
      currentUrl: afterLoginState.currentUrl,
      title: afterLoginState.title,
      reason: afterLoginState.reason
    };
  }

  return {
    success: false,
    loggedIn: false,
    requiresHuman: true,
    message: "自动填写后仍未确认登录成功，请在 Playwright 窗口完成验证或人工登录。",
    currentUrl: afterLoginState.currentUrl,
    title: afterLoginState.title,
    reason: afterLoginState.reason
  };
}

async function findVisibleSelector(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count > 0 && (await locator.isVisible().catch(() => false))) {
      return selector;
    }
  }

  return undefined;
}

async function humanRequiredResult(page: Page, message: string): Promise<CrossSearchPrepareLoginResult> {
  const state = await inspectCrossSearchPage(page);

  return {
    success: false,
    loggedIn: state.loggedIn,
    requiresHuman: true,
    message,
    currentUrl: state.currentUrl,
    title: state.title,
    reason: state.reason
  };
}
