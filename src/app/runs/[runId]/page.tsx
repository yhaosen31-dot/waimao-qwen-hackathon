import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, FileText, Mail, ServerCog, SkipForward, Users } from "lucide-react";
import { EmailDraftReviewForm } from "@/components/email-draft-review-form";
import { ForceEmailDraftButton } from "@/components/force-email-draft-button";
import { KeywordApprovalForm } from "@/components/keyword-approval-form";
import { RunProgressPoller } from "@/components/run-progress-poller";
import { RunStepStatusBadge } from "@/components/run-step-status-badge";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buyerFitLabels, labelValue, suggestedActionLabels } from "@/lib/crm-labels";
import { getRunResults } from "@/repositories/store";
import { formatDateTime } from "@/lib/utils";
import type { Keyword } from "@/types";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{
    runId: string;
  }>;
}

export default async function RunDetailPage({ params }: Params) {
  const { runId } = await params;
  const results = await getRunResults(runId);

  if (!results) notFound();

  const completedCount = results.runSteps.filter((step) => step.status === "completed").length;
  const waitingForKeywords = results.runSteps.some(
    (step) => step.stepKey === "humanApproveKeywords" && step.status === "waiting_review"
  );
  const waitingForEmail = results.runSteps.some(
    (step) => step.stepKey === "humanApproveEmail" && step.status === "waiting_review"
  );
  const approvedKeywords = results.keywords.filter((keyword) => keyword.status === "approved");
  const rejectedKeywords = results.keywords.filter((keyword) => keyword.status === "rejected");
  const approvedDrafts = results.emailDrafts.filter((draft) => draft.status === "approved");
  const skippedDrafts = results.emailDrafts.filter((draft) => draft.status === "skipped");
  const searchMode = String(results.run.metadata?.searchMode ?? "fallback");
  const providerPriority = Array.isArray(results.run.metadata?.providerPriority)
    ? results.run.metadata.providerPriority.join(", ")
    : "exa";
  const importJobId =
    typeof results.run.metadata?.importJobId === "string" ? results.run.metadata.importJobId : undefined;
  const queueStatus =
    typeof results.run.metadata?.queueStatus === "string" ? results.run.metadata.queueStatus : undefined;
  const queueJobId =
    typeof results.run.metadata?.queueJobId === "string" ? results.run.metadata.queueJobId : undefined;
  const queueError =
    typeof results.run.metadata?.queueError === "string" ? results.run.metadata.queueError : undefined;
  const currentQueueStep =
    typeof results.run.metadata?.currentQueueStep === "string"
      ? results.run.metadata.currentQueueStep
      : undefined;
  const displayStatus =
    results.run.status === "created" &&
    (queueStatus === "queued" || queueStatus === "running" || queueStatus === "waiting_review")
      ? queueStatus
      : results.run.status;
  const buyerFitStats = {
    scored: results.companies.filter((company) => Boolean(company.buyerFitTier)).length,
    high: results.companies.filter((company) => company.buyerFitTier === "high").length,
    medium: results.companies.filter((company) => company.buyerFitTier === "medium").length,
    low: results.companies.filter((company) => company.buyerFitTier === "low").length,
    unknown: results.companies.filter((company) => company.buyerFitTier === "unknown").length,
    manualReview: results.companies.filter(
      (company) => company.suggestedAction === "manual_review"
    ).length
  };
  const enrichmentStats = {
    websiteFound: results.companies.filter((company) => Boolean(company.primaryWebsite ?? company.website)).length,
    emailFound: new Set(results.emailAddresses.map((email) => email.companyId)).size,
    whatsappFound: new Set(results.whatsappNumbers.map((whatsapp) => whatsapp.companyId)).size,
    draftsWaitingReview: results.emailDrafts.filter((draft) => draft.status === "waiting_review").length,
    productSearchCandidates: results.companies.filter((company) => company.source === "product_search").length
  };
  const activeDraftCompanyIds = new Set(
    results.emailDrafts.filter((draft) => draft.status !== "skipped").map((draft) => draft.companyId)
  );
  const forceDraftCandidates = results.companies.filter((company) => !activeDraftCompanyIds.has(company.id));
  const failedSteps = results.runSteps.filter((step) => step.status === "failed");
  const failedCompanies = results.companies.filter((company) => company.enrichmentStatus === "failed");
  const failedDrafts = results.emailDrafts.filter((draft) => draft.status === "failed");
  const emailByCompanyId = new Map<string, string>();
  for (const email of results.emailAddresses) {
    if (!emailByCompanyId.has(email.companyId)) emailByCompanyId.set(email.companyId, email.email);
  }

  return (
    <div className="space-y-6">
      <RunProgressPoller runId={results.run.id} status={displayStatus} />
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            {results.run.normalizedProduct ?? results.run.productInput}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Run {results.run.id} / created {formatDateTime(results.run.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={displayStatus === "completed" ? "success" : "warning"}>
            {displayStatus}
          </Badge>
          {importJobId ? (
            <Button asChild variant="outline">
              <Link href={`/imports/${importJobId}`}>打开导入批次</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/reviews">Reviews</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/companies">Companies</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-7">
        <StatCard icon={Clock} label="Progress" value={`${completedCount}/${results.runSteps.length}`} />
        <StatCard icon={CheckCircle2} label="Status" value={displayStatus} />
        <StatCard icon={Users} label="Companies" value={results.companies.length} />
        <StatCard icon={FileText} label="Drafts" value={results.emailDrafts.length} />
        <StatCard icon={Mail} label="Approved" value={approvedDrafts.length} />
        <StatCard icon={SkipForward} label="Skipped" value={skippedDrafts.length} />
        <StatCard icon={FileText} label="Keywords" value={approvedKeywords.length} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard icon={FileText} label="Search mode" value={searchMode} />
        <StatCard icon={FileText} label="Provider priority" value={providerPriority} />
      </div>

      {queueStatus || queueJobId ? (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard icon={ServerCog} label="Queue status" value={queueStatus ?? "-"} />
          <StatCard icon={ServerCog} label="Queue job" value={queueJobId ?? "-"} />
          <StatCard icon={ServerCog} label="Current queue step" value={currentQueueStep ?? "-"} />
        </div>
      ) : null}

      {displayStatus === "failed" || queueError || failedSteps.length > 0 || failedCompanies.length > 0 || failedDrafts.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              失败原因与可重试项
            </CardTitle>
            <CardDescription>
              后台任务失败时，先看这里的错误原因。Excel 导入批次可回到对应导入详情页重试失败客户。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {queueError ? (
              <div className="rounded-md border border-amber-200 bg-white p-3">
                <div className="font-medium text-amber-800">Worker 错误</div>
                <div className="mt-1 break-words text-slate-700">{queueError}</div>
              </div>
            ) : null}
            {failedSteps.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-white p-3">
                <div className="font-medium text-amber-800">失败节点</div>
                <div className="mt-2 space-y-2">
                  {failedSteps.map((step) => (
                    <div key={step.id}>
                      <span className="font-medium">{step.label}</span>
                      <span className="text-muted-foreground">：{step.errorMessage ?? step.summary ?? "未记录具体错误"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {failedCompanies.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-white p-3">
                <div className="font-medium text-amber-800">补全失败客户</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {failedCompanies.slice(0, 10).map((company) => (
                    <Link className="text-primary" href={`/companies/${company.id}`} key={company.id}>
                      {company.name}
                    </Link>
                  ))}
                </div>
                {failedCompanies.length > 10 ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    还有 {failedCompanies.length - 10} 个失败客户，请到客户列表按补全状态筛选。
                  </div>
                ) : null}
              </div>
            ) : null}
            {failedDrafts.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-white p-3">
                <div className="font-medium text-amber-800">邮件草稿失败</div>
                <div className="mt-2 space-y-2">
                  {failedDrafts.slice(0, 10).map((draft) => (
                    <div key={draft.id}>
                      <span className="font-medium">{draft.toEmail ?? draft.companyId}</span>
                      <span className="text-muted-foreground">：{draft.errorMessage ?? "未记录具体错误"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="Scored" value={buyerFitStats.scored} />
        <StatCard icon={Users} label="High" value={buyerFitStats.high} />
        <StatCard icon={Users} label="Medium" value={buyerFitStats.medium} />
        <StatCard icon={Users} label="Low" value={buyerFitStats.low} />
        <StatCard icon={Users} label="Unknown" value={buyerFitStats.unknown} />
        <StatCard icon={Users} label="Manual review" value={buyerFitStats.manualReview} />
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={Users} label="Product candidates" value={enrichmentStats.productSearchCandidates} />
        <StatCard icon={FileText} label="Websites found" value={enrichmentStats.websiteFound} />
        <StatCard icon={Mail} label="Emails found" value={enrichmentStats.emailFound} />
        <StatCard icon={Mail} label="WhatsApp found" value={enrichmentStats.whatsappFound} />
        <StatCard icon={Clock} label="Waiting review" value={enrichmentStats.draftsWaitingReview} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LangGraph 节点进度</CardTitle>
          <CardDescription>每个 LangGraph 节点的执行状态和摘要。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {results.runSteps.map((step, index) => (
              <div className="rounded-md border p-3" key={step.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">
                    {index + 1}. {step.label}
                  </div>
                  <RunStepStatusBadge status={step.status} />
                </div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">
                  {step.summary ?? "Waiting"}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>关键词审核结果</CardTitle>
          <CardDescription>
            只有 approved keywords 会进入产品搜索获客流程。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {waitingForKeywords ? (
            <KeywordApprovalForm keywords={results.keywords} runId={results.run.id} />
          ) : null}
          <KeywordTable
            approvedKeywords={approvedKeywords}
            keywords={results.keywords}
            rejectedKeywords={rejectedKeywords}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>邮件审核结果</CardTitle>
          <CardDescription>第一版只保存草稿和审核状态，不真实发送邮件。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {waitingForEmail ? (
            <EmailDraftReviewForm drafts={results.emailDrafts} runId={results.run.id} />
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.emailDrafts.map((draft) => {
                const company = results.companies.find((item) => item.id === draft.companyId);
                const toEmail =
                  draft.toEmail ??
                  results.emailAddresses.find((email) => email.id === draft.toEmailAddressId)?.email ??
                  results.emailAddresses.find((email) => email.companyId === draft.companyId)?.email ??
                  "-";

                return (
                  <TableRow key={draft.id}>
                    <TableCell>{company?.name ?? draft.companyId}</TableCell>
                    <TableCell>{toEmail}</TableCell>
                    <TableCell>{draft.subject}</TableCell>
                    <TableCell>
                      <Badge variant={draft.status === "approved" ? "success" : "outline"}>
                        {draft.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {forceDraftCandidates.length > 0 ? (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">未生成开发信的客户</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  这些客户通常因为 low / skip / 无邮箱被自动跳过。你可以手动强制生成草稿，仍需人工审核，不会自动发送。
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Buyer Fit</TableHead>
                    <TableHead>Suggested Action</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forceDraftCandidates.slice(0, 50).map((company) => {
                    const email = company.recommendedEmails?.[0] ?? emailByCompanyId.get(company.id);
                    const disabledReason =
                      company.status === "blacklist"
                        ? "黑名单客户不能生成草稿。"
                        : !email
                          ? "没有邮箱，不能生成草稿。"
                          : undefined;

                    return (
                      <TableRow key={company.id}>
                        <TableCell>
                          <Link className="font-medium text-primary" href={`/companies/${company.id}`}>
                            {company.name}
                          </Link>
                        </TableCell>
                        <TableCell>{labelValue(company.buyerFitTier ?? "unknown", buyerFitLabels)}</TableCell>
                        <TableCell>{labelValue(company.suggestedAction, suggestedActionLabels)}</TableCell>
                        <TableCell>{email ?? "-"}</TableCell>
                        <TableCell>
                          <ForceEmailDraftButton
                            companyId={company.id}
                            disabledReason={disabledReason}
                            label="生成草稿"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {forceDraftCandidates.length > 50 ? (
                <p className="text-xs text-muted-foreground">
                  这里只显示前 50 个未生成草稿的客户，更多客户可在客户详情页生成。
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function KeywordTable({
  approvedKeywords,
  keywords,
  rejectedKeywords
}: {
  approvedKeywords: Keyword[];
  keywords: Keyword[];
  rejectedKeywords: Keyword[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <KeywordGroup keywords={keywords} title="原始关键词" />
      <KeywordGroup keywords={approvedKeywords} title="已批准关键词" />
      <KeywordGroup keywords={rejectedKeywords} title="被拒绝关键词" />
    </div>
  );
}

function KeywordGroup({
  keywords,
  title
}: {
  keywords: Keyword[];
  title: string;
}) {
  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium">{title}</div>
      <div className="divide-y">
        {keywords.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">暂无</div>
        ) : (
          keywords.map((keyword) => (
            <div className="p-3 text-sm" key={keyword.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{keyword.value}</span>
                <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                  {Math.round((keyword.confidence ?? 0) * 100)}%
                </span>
              </div>
              <div className="mt-2 text-xs leading-5 text-muted-foreground">
                {keyword.reason ?? "Keyword reason pending."}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
