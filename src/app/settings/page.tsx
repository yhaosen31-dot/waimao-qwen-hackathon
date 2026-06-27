import { SearchCheck, ShieldCheck } from "lucide-react";
import { CrossSearchConnectionPanel } from "@/components/cross-search-connection-panel";
import { SearchProviderTestButton } from "@/components/search-provider-test-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { crossSearchProvider } from "@/providers/crossSearchProvider";
import { searchAggregationService } from "@/services/searchAggregationService";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const statuses = searchAggregationService.statuses();
  const modes = Object.values(statuses).map((status) => status.mode);
  const currentSearchMode = modes.every((mode) => mode === "mock")
    ? "mock"
    : modes.every((mode) => mode === "real")
      ? "real"
      : "mixed";
  const crossSearchStatus = crossSearchProvider.status();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provider API Key 和跨境搜账号只在服务端读取，不会返回到前端。
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SearchCheck className="h-5 w-5 text-blue-600" />
            <CardTitle>外部搜索 Provider</CardTitle>
          </div>
          <CardDescription>
            用于官网发现、联系方式发现、WhatsApp、LinkedIn / Facebook 和 evidence 保存。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">当前模式</span>
            <Badge variant={currentSearchMode === "mock" ? "outline" : "success"}>
              {currentSearchMode}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(statuses).map(([name, status]) => (
              <div className="rounded-md border p-4" key={name}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium uppercase">{name}</div>
                  <Badge variant={status.configured ? "success" : "outline"}>
                    {status.configured ? "configured" : "not configured"}
                  </Badge>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">mode: {status.mode}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  status: {status.ok ? "ok" : "fallback to mock"}
                </div>
              </div>
            ))}
          </div>
          <SearchProviderTestButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <CardTitle>跨境搜连接状态</CardTitle>
          </div>
          <CardDescription>
            只检查登录态和辅助人工登录；不执行一键搜采集、导出或高频访问。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatusItem
              label="当前模式"
              value={crossSearchStatus.mode}
              variant={crossSearchStatus.mode === "real" ? "success" : "outline"}
            />
            <StatusItem
              label="账号配置"
              value={crossSearchStatus.hasCredentials ? "已配置" : "未配置"}
              variant={crossSearchStatus.hasCredentials ? "success" : "warning"}
            />
            <StatusItem
              label="运行方式"
              value={crossSearchStatus.headless ? "headless" : "visible browser"}
              variant="outline"
            />
            <StatusItem
              label="登录态目录"
              value={crossSearchStatus.profileDir}
              variant="outline"
              wrap
            />
          </div>

          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            <div className="break-all">入口：{crossSearchStatus.baseUrl}</div>
            <div className="mt-1 break-all">一键搜地址：{crossSearchStatus.oneSearchUrl}</div>
          </div>

          <CrossSearchConnectionPanel mode={crossSearchStatus.mode} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatusItem({
  label,
  value,
  variant,
  wrap = false
}: {
  label: string;
  value: string;
  variant: "outline" | "success" | "warning";
  wrap?: boolean;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={wrap ? "mt-2 break-all text-sm" : "mt-2 flex items-center"}>
        <Badge variant={variant}>{value}</Badge>
      </div>
    </div>
  );
}
