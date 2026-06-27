import { NextResponse } from "next/server";
import { crossSearchProvider } from "@/providers/crossSearchProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const providerStatus = crossSearchProvider.status();

  try {
    const result = await crossSearchProvider.prepareLogin();

    return NextResponse.json({
      mode: providerStatus.mode,
      configuredAccount: providerStatus.hasCredentials,
      success: result.success,
      loggedIn: result.loggedIn,
      requiresHuman: result.requiresHuman,
      message: result.message,
      currentUrl: result.currentUrl,
      title: result.title,
      reason: result.reason
    });
  } catch (error) {
    return NextResponse.json({
      mode: providerStatus.mode,
      configuredAccount: providerStatus.hasCredentials,
      success: false,
      loggedIn: false,
      requiresHuman: providerStatus.mode === "real",
      message:
        providerStatus.mode === "real"
          ? "打开跨境搜登录窗口失败，请确认 Playwright Chromium 已安装。"
          : "跨境搜 mock mode 不需要人工登录。",
      reason: error instanceof Error ? error.message : "Unknown cross-search login error"
    });
  }
}
