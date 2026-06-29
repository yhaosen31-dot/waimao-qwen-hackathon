import Link from "next/link";
import { CheckCircle2, FileText, KeyRound, Mail } from "lucide-react";
import { EmailDraftActionPanel } from "@/components/email-draft-action-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { emailStatusLabels, labelValue } from "@/lib/crm-labels";
import { readReviewStore } from "@/repositories/store";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const db = await readReviewStore();
  const keywordRunIds = new Set(
    db.runSteps
      .filter((step) => step.stepKey === "humanApproveKeywords" && step.status === "waiting_review")
      .map((step) => step.runId)
  );
  const emailRunIds = new Set(
    db.runSteps
      .filter((step) => step.stepKey === "humanApproveEmail" && step.status === "waiting_review")
      .map((step) => step.runId)
  );
  const keywordRuns = db.runs.filter((run) => keywordRunIds.has(run.id));
  const emailRuns = db.runs.filter((run) => emailRunIds.has(run.id));
  const completedRuns = db.runs.filter(
    (run) => run.keywordReviewStatus === "approved" && run.emailReviewStatus === "approved"
  );
  const waitingDrafts = db.emailDrafts.filter((draft) => draft.status === "waiting_review");
  const draftDrafts = db.emailDrafts.filter((draft) => draft.status === "draft");
  const approvedEmailDrafts = db.emailDrafts.filter((draft) => draft.status === "approved");
  const skippedEmailDrafts = db.emailDrafts.filter((draft) => draft.status === "skipped");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">人工审核中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            关键词和邮件审核任务都会沉淀到这里，审核完成后进入 CRM。
          </p>
        </div>
        <Button asChild>
          <Link href="/runs/new">创建获客任务</Link>
        </Button>
      </div>

      <ReviewSection
        description="generateKeywords 后暂停，勾选关键词后继续生成客户。"
        icon={KeyRound}
        runs={keywordRuns}
        title="待审核关键词任务"
      />
      <ReviewSection
        description="generateEmailDraft 后暂停，逐封编辑、批准、跳过或保存草稿。"
        icon={Mail}
        runs={emailRuns}
        title="待审核邮件任务"
      />
      <ReviewSection
        description="已完成关键词和邮件审核，并完成 CRM 入库。"
        icon={CheckCircle2}
        runs={completedRuns}
        title="已完成审核任务"
      />
      <EmailQueueSection db={db} drafts={waitingDrafts} title="waiting_review 邮件" />
      <EmailQueueSection db={db} drafts={draftDrafts} title="draft 邮件" />
      <EmailQueueSection db={db} drafts={approvedEmailDrafts} title="approved 邮件" />
      <EmailQueueSection db={db} drafts={skippedEmailDrafts} title="skipped 邮件" />
    </div>
  );
}

function ReviewSection({
  description,
  icon: Icon,
  runs,
  title
}: {
  description: string;
  icon: typeof FileText;
  runs: Array<{
    id: string;
    productInput: string;
    normalizedProduct?: string;
    status: string;
    createdAt: string;
  }>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-blue-600" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
            暂无任务
          </div>
        ) : (
          <div className="divide-y rounded-md border">
            {runs.map((run) => (
              <Link
                className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50"
                href={`/runs/${run.id}`}
                key={run.id}
              >
                <div>
                  <div className="font-medium">{run.normalizedProduct ?? run.productInput}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {run.id} / {formatDateTime(run.createdAt)}
                  </div>
                </div>
                <Badge variant={run.status === "completed" ? "success" : "warning"}>
                  {run.status}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmailQueueSection({
  db,
  drafts,
  title
}: {
  db: Awaited<ReturnType<typeof readReviewStore>>;
  drafts: Awaited<ReturnType<typeof readReviewStore>>["emailDrafts"];
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-blue-600" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>可编辑、保存草稿、批准、跳过或重新生成；不会真实发送。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {drafts.length === 0 ? (
          <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
            暂无邮件
          </div>
        ) : (
          drafts.map((draft) => {
            const company = db.companies.find((item) => item.id === draft.companyId);

            return (
              <div className="rounded-md border p-4" key={draft.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{company?.name ?? draft.companyId}</div>
                    <div className="text-xs text-muted-foreground">
                      {draft.toEmail ?? "无邮箱"} / 线索分 {company?.leadScore ?? "-"}
                    </div>
                  </div>
                  <Badge variant={draft.status === "approved" ? "success" : "outline"}>
                    {labelValue(draft.status, emailStatusLabels)}
                  </Badge>
                </div>
                <EmailDraftActionPanel compact draft={draft} />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
