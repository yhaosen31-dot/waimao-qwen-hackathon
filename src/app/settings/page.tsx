import {
  Database,
  LockKeyhole,
  MailCheck,
  SearchCheck,
  ServerCog,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";
import { EmailProviderTestPanel } from "@/components/email-provider-test-panel";
import { RedisTestButton } from "@/components/redis-test-button";
import { SearchProviderTestButton } from "@/components/search-provider-test-button";
import { SupabaseTestButton } from "@/components/supabase-test-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { crossSearchProvider } from "@/providers/crossSearchProvider";
import { queueSettingsStatus } from "@/queue/redis";
import { dataStoreStatus } from "@/repositories/storeConfig";
import { auditEnabled } from "@/services/auditLogService";
import { appAuthStatus } from "@/services/authService";
import { emailProviderStatuses } from "@/services/emailSendService";
import { rateLimitStatus } from "@/services/rateLimitService";
import { searchAggregationService } from "@/services/searchAggregationService";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const providerStatuses = searchAggregationService.statuses();
  const providerModes = Object.values(providerStatuses).map((status) => status.mode);
  const currentSearchMode = providerModes.every((mode) => mode === "real")
    ? "real"
    : providerModes.some((mode) => mode === "real")
      ? "mixed"
      : "not_configured";
  const crossSearchStatus = crossSearchProvider.status();
  const emailStatuses = emailProviderStatuses();
  const storeStatus = dataStoreStatus();
  const queueStatus = queueSettingsStatus();
  const securityStatus = rateLimitStatus();
  const authStatus = appAuthStatus();
  const isAuditEnabled = auditEnabled();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          API Key 只在服务端读取。Service role key、SMTP 密码和邮件 API Key 不会返回到前端。
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-blue-600" />
            <CardTitle>登录与组织权限</CardTitle>
          </div>
          <CardDescription>
            上线时可以开启 Supabase Auth。开启后，页面和 API 都需要登录，并且用户必须属于当前组织。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatusItem
              label="APP_AUTH_ENABLED"
              value={authStatus.requested ? "true" : "false"}
              variant={authStatus.requested ? "success" : "outline"}
            />
            <StatusItem
              label="当前保护状态"
              value={authStatus.enabled ? "enabled" : "disabled"}
              variant={authStatus.enabled ? "success" : "warning"}
            />
            <StatusItem
              label="Supabase Auth"
              value={authStatus.publicConfigured ? "configured" : "missing"}
              variant={authStatus.publicConfigured ? "success" : "outline"}
            />
            <StatusItem
              label="Admin key"
              value={authStatus.adminConfigured ? "configured" : "missing"}
              variant={authStatus.adminConfigured ? "success" : "outline"}
            />
          </div>
          <div
            className={
              authStatus.enabled
                ? "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                : "rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
            }
          >
            {authStatus.enabled
              ? "登录保护已开启：所有业务页面和 API 会先检查 Supabase 登录状态与 organization_members 成员关系。"
              : "登录保护未开启：当前适合本地调试。上线前在 Supabase 创建用户后，再把 APP_AUTH_ENABLED=true。"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            <CardTitle>数据存储</CardTitle>
          </div>
          <CardDescription>
            默认可以回退到本地 JSON store。配置 Supabase 后，业务数据会写入数据库。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatusItem
              label="DATA_STORE_PROVIDER"
              value={storeStatus.requestedProvider}
              variant={storeStatus.requestedProvider === "supabase" ? "success" : "outline"}
            />
            <StatusItem
              label="当前 store"
              value={storeStatus.activeProvider}
              variant={storeStatus.activeProvider === "supabase" ? "success" : "outline"}
            />
            <StatusItem
              label="Supabase URL"
              value={storeStatus.supabaseUrlConfigured ? "configured" : "missing"}
              variant={storeStatus.supabaseUrlConfigured ? "success" : "outline"}
            />
            <StatusItem
              label="Anon / publishable key"
              value={storeStatus.supabaseAnonKeyConfigured ? "configured" : "missing"}
              variant={storeStatus.supabaseAnonKeyConfigured ? "success" : "outline"}
            />
            <StatusItem
              label="Service role / secret key"
              value={storeStatus.supabaseServiceRoleConfigured ? "configured" : "missing"}
              variant={storeStatus.supabaseServiceRoleConfigured ? "success" : "outline"}
            />
            <StatusItem label="Storage bucket" value={storeStatus.importsBucket} variant="outline" wrap />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {storeStatus.activeProvider === "supabase"
              ? "Supabase 已启用：客户、证据、邮件草稿、发送记录和任务数据会写入数据库。"
              : "当前使用 local store：Supabase 未配置完整或 DATA_STORE_PROVIDER 不是 supabase 时，系统会继续使用本地数据。"}
          </div>
          <SupabaseTestButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ServerCog className="h-5 w-5 text-blue-600" />
            <CardTitle>后台任务队列</CardTitle>
          </div>
          <CardDescription>
            长时间任务可以进入 BullMQ + Redis Worker 后台执行。未启用时继续使用当前同步流程。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatusItem
              label="QUEUE_ENABLED"
              value={queueStatus.queueEnabled ? "true" : "false"}
              variant={queueStatus.queueEnabled ? "success" : "outline"}
            />
            <StatusItem
              label="REDIS_URL"
              value={queueStatus.redisUrlConfigured ? "configured" : "missing"}
              variant={queueStatus.redisUrlConfigured ? "success" : "outline"}
            />
            <StatusItem label="Queue name" value={queueStatus.queueName} variant="outline" wrap />
            <StatusItem
              label="Worker concurrency"
              value={String(queueStatus.workerConcurrency)}
              variant="outline"
            />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {queueStatus.queueEnabled
              ? "队列已启用：请同时运行 Redis 和 npm run worker，任务会进入后台执行。"
              : "队列未启用：当前仍按同步方式执行，适合本地调试。"}
          </div>
          <RedisTestButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-blue-600" />
            <CardTitle>安全 / 限速 / 审计</CardTitle>
          </div>
          <CardDescription>
            关键写操作、设置测试、邮件发送和导出接口会被限速，关键动作会写入 audit_logs。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatusItem
              label="Rate limit"
              value={securityStatus.enabled ? "enabled" : "disabled"}
              variant={securityStatus.enabled ? "success" : "warning"}
            />
            <StatusItem label="Rate backend" value={securityStatus.backend} variant="outline" />
            <StatusItem
              label="Audit logs"
              value={isAuditEnabled ? "enabled" : "disabled"}
              variant={isAuditEnabled ? "success" : "warning"}
            />
            <StatusItem
              label="Auth login limit"
              value={`${securityStatus.policies.auth_login.limit}/min`}
              variant="outline"
            />
            <StatusItem
              label="Email send limit"
              value={`${securityStatus.policies.email_send.limit}/5min`}
              variant="outline"
            />
            <StatusItem
              label="Run start limit"
              value={`${securityStatus.policies.runs_start.limit}/min`}
              variant="outline"
            />
            <StatusItem
              label="Search provider limit"
              value={`${securityStatus.policies.search_provider.limit}/min`}
              variant="outline"
            />
            <StatusItem
              label="MiniMax limit"
              value={`${securityStatus.policies.minimax.limit}/min`}
              variant="outline"
            />
            <StatusItem
              label="Settings test limit"
              value={`${securityStatus.policies.settings_test.limit}/min`}
              variant="outline"
            />
            <StatusItem
              label="Review action limit"
              value={`${securityStatus.policies.review_action.limit}/min`}
              variant="outline"
            />
            <StatusItem
              label="CRM write limit"
              value={`${securityStatus.policies.crm_write.limit}/min`}
              variant="outline"
            />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            生产环境建议使用 Redis 限速。Redis 不可用时，系统会降级到进程内存限速，避免业务直接崩掉。
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SearchCheck className="h-5 w-5 text-blue-600" />
            <CardTitle>外部搜索 Provider</CardTitle>
          </div>
          <CardDescription>
            用于官网、邮箱、电话、WhatsApp、LinkedIn 和 Facebook 搜索，并为每条结果保存 evidence。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">当前模式</span>
            <Badge variant={currentSearchMode === "not_configured" ? "outline" : "success"}>
              {currentSearchMode}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(providerStatuses).map(([name, status]) => (
              <div className="rounded-md border p-4" key={name}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium uppercase">{name}</div>
                  <Badge variant={status.configured ? "success" : "outline"}>
                    {status.configured ? "configured" : "not configured"}
                  </Badge>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">mode: {status.mode}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  status: {status.ok ? "ok" : status.configured ? "error" : "not configured"}
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
            <MailCheck className="h-5 w-5 text-blue-600" />
            <CardTitle>邮件发送设置</CardTitle>
          </div>
          <CardDescription>
            当前只允许用户点击发送 approved 单封邮件，不支持自动群发或批量发送。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <StatusItem
              label="EMAIL_PROVIDER"
              value={emailStatuses.selectedProvider}
              variant={emailStatuses.selectedProvider === "mock" ? "outline" : "success"}
            />
            <StatusItem
              label="EMAIL_SEND_REAL_MODE"
              value={emailStatuses.realMode ? "true" : "false"}
              variant={emailStatuses.realMode ? "warning" : "outline"}
            />
            <StatusItem
              label="Resend"
              value={emailStatuses.resend.configured ? "configured" : "not configured"}
              variant={emailStatuses.resend.configured ? "success" : "outline"}
            />
            <StatusItem
              label="SMTP"
              value={emailStatuses.smtp.configured ? "configured" : "not configured"}
              variant={emailStatuses.smtp.configured ? "success" : "outline"}
            />
            <StatusItem
              label="SMTP_HOST"
              value={emailStatuses.smtp.host ?? "not configured"}
              variant="outline"
              wrap
            />
            <StatusItem
              label="SMTP_PORT"
              value={emailStatuses.smtp.port ? String(emailStatuses.smtp.port) : "not configured"}
              variant="outline"
            />
            <StatusItem
              label="SMTP_FROM_EMAIL"
              value={emailStatuses.smtp.fromEmail ?? "not configured"}
              variant="outline"
              wrap
            />
            <StatusItem
              label="SMTP_FROM_NAME"
              value={emailStatuses.smtp.fromName ?? "-"}
              variant="outline"
              wrap
            />
          </div>
          <div
            className={
              emailStatuses.realMode
                ? "rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                : "rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
            }
          >
            {emailStatuses.realMode
              ? "Real mode 已开启：仍然只允许发送 approved 单封邮件。"
              : "Real mode 已关闭：当前不会真实发送邮件，只会记录 mock_sent。"}
          </div>
          <EmailProviderTestPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <CardTitle>跨境搜旧线路</CardTitle>
          </div>
          <CardDescription>
            账号出现风控后，当前系统不再访问跨境搜网页，也不再打开 Playwright 登录窗口。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <StatusItem label="状态" value="已关闭" variant="warning" />
            <StatusItem label="当前模式" value={crossSearchStatus.mode} variant="outline" />
            <StatusItem label="推荐使用" value="Excel 导入 / 产品搜索" variant="outline" wrap />
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-medium">原因：账号出现风控，当前系统不再访问跨境搜网页。</div>
            <div className="mt-2 text-amber-800">
              请使用 Excel 导入获客或产品搜索获客。官网、邮箱、电话、WhatsApp、LinkedIn 和
              Facebook 仍然通过 EXA / Tavily / YOU 聚合搜索完成。
            </div>
          </div>
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
