"use client";

import { useState } from "react";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type CrossSearchResult = {
  mode: "mock" | "real";
  configuredAccount: boolean;
  success?: boolean;
  loggedIn: boolean;
  requiresHuman: boolean;
  message: string;
  currentUrl?: string;
  title?: string;
  reason?: string;
};

interface CrossSearchConnectionPanelProps {
  mode: "mock" | "real";
}

export function CrossSearchConnectionPanel({ mode }: CrossSearchConnectionPanelProps) {
  const [result, setResult] = useState<CrossSearchResult | null>(null);
  const [loadingAction, setLoadingAction] = useState<"test" | "login" | null>(null);

  async function runAction(action: "test" | "login") {
    setLoadingAction(action);
    const endpoint =
      action === "test"
        ? "/api/settings/test-cross-search"
        : "/api/settings/prepare-cross-search-login";
    const response = await fetch(endpoint, { method: "POST" });
    setResult((await response.json()) as CrossSearchResult);
    setLoadingAction(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button disabled={Boolean(loadingAction)} onClick={() => runAction("test")}>
          {loadingAction === "test" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          测试连接
        </Button>
        <Button
          disabled={mode !== "real" || Boolean(loadingAction)}
          onClick={() => runAction("login")}
          variant="outline"
        >
          {loadingAction === "login" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          打开人工登录
        </Button>
      </div>

      {result ? (
        <div className="rounded-md border bg-muted/35 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={result.mode === "real" ? "success" : "outline"}>{result.mode}</Badge>
            <Badge variant={result.loggedIn ? "success" : "warning"}>
              {result.loggedIn ? "已登录" : "未登录"}
            </Badge>
            <Badge variant={result.requiresHuman ? "warning" : "outline"}>
              {result.requiresHuman ? "需要人工处理" : "无需人工处理"}
            </Badge>
          </div>
          <div className="mt-3 font-medium">{result.message}</div>
          {result.currentUrl ? (
            <div className="mt-2 break-all text-muted-foreground">当前 URL：{result.currentUrl}</div>
          ) : null}
          {result.title ? <div className="mt-1 text-muted-foreground">页面标题：{result.title}</div> : null}
          {result.reason ? <div className="mt-1 text-muted-foreground">检测原因：{result.reason}</div> : null}
          {result.requiresHuman ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              请在弹出的本地 Playwright Chromium 窗口完成登录、验证码、二维码或短信确认，然后再次测试连接。
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
