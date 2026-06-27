import { NextResponse } from "next/server";
import { crossSearchProvider } from "@/providers/crossSearchProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const providerStatus = crossSearchProvider.status();

  try {
    const status = await crossSearchProvider.checkSession();

    return NextResponse.json({
      mode: providerStatus.mode,
      configuredAccount: providerStatus.hasCredentials,
      loggedIn: status.loggedIn,
      requiresHuman: status.requiresHuman,
      message: buildSessionMessage(providerStatus.mode, status.loggedIn, status.requiresHuman),
      currentUrl: status.currentUrl,
      title: status.title,
      reason: status.reason
    });
  } catch (error) {
    return NextResponse.json({
      mode: providerStatus.mode,
      configuredAccount: providerStatus.hasCredentials,
      loggedIn: false,
      requiresHuman: providerStatus.mode === "real",
      message:
        providerStatus.mode === "real"
          ? "跨境搜登录态检查失败，请确认 Playwright Chromium 已安装，并可人工重试。"
          : "跨境搜 mock mode 未打开真实浏览器。",
      reason: error instanceof Error ? error.message : "Unknown cross-search check error"
    });
  }
}

function buildSessionMessage(mode: "mock" | "real", loggedIn: boolean, requiresHuman: boolean) {
  if (mode === "mock") {
    return "跨境搜当前为 mock mode，不检查真实登录态。";
  }

  if (loggedIn) {
    return "已检测到跨境搜登录态。";
  }

  if (requiresHuman) {
    return "需要人工登录或验证码确认。";
  }

  return "未检测到跨境搜登录态。";
}
