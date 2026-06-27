import Link from "next/link";
import { CheckCircle2, FileText, KeyRound, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readStore } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const db = await readStore();
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
