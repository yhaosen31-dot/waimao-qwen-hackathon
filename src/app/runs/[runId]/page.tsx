import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, FileText, Mail, SkipForward, Users } from "lucide-react";
import { EmailDraftReviewForm } from "@/components/email-draft-review-form";
import { KeywordApprovalForm } from "@/components/keyword-approval-form";
import { RunStepStatusBadge } from "@/components/run-step-status-badge";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRunResults } from "@/lib/store";
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

  return (
    <div className="space-y-6">
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
          <Badge variant={results.run.status === "completed" ? "success" : "warning"}>
            {results.run.status}
          </Badge>
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
        <StatCard icon={CheckCircle2} label="Status" value={results.run.status} />
        <StatCard icon={Users} label="Companies" value={results.companies.length} />
        <StatCard icon={FileText} label="Drafts" value={results.emailDrafts.length} />
        <StatCard icon={Mail} label="Approved" value={approvedDrafts.length} />
        <StatCard icon={SkipForward} label="Skipped" value={skippedDrafts.length} />
        <StatCard icon={FileText} label="Keywords" value={approvedKeywords.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LangGraph 节点进度</CardTitle>
          <CardDescription>每个 mock 节点的执行状态和摘要。</CardDescription>
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
            只有 approved keywords 会进入跨境搜 mock 客户生成。
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
                {keyword.reason ?? "Mock keyword reason pending."}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
