import Link from "next/link";
import { notFound } from "next/navigation";
import { ApproveAllDraftsAction, ApproveDraftAction, KeywordReviewAction } from "@/components/review-actions";
import { ReviewStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTaskBundle } from "@/server/storage/json-store";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{
    taskId: string;
  }>;
}

export default async function TaskReviewPage({ params }: Params) {
  const { taskId } = await params;
  const bundle = await getTaskBundle(taskId);

  if (!bundle) notFound();

  const { task, drafts, customers } = bundle;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Human review</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve generated keywords and email drafts before any future real sending provider is enabled.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/tasks/${task.id}/run`}>Back to run</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Keyword approval</CardTitle>
              <ReviewStatusBadge status={task.keywordReviewStatus} />
            </div>
            <CardDescription>Edit one keyword per line, then approve.</CardDescription>
          </CardHeader>
          <CardContent>
            <KeywordReviewAction keywords={task.keywords} taskId={task.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Email draft approval</CardTitle>
                <CardDescription>Drafts are saved locally only and never sent.</CardDescription>
              </div>
              <ApproveAllDraftsAction taskId={task.id} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {drafts.map((draft) => {
              const customer = customers.find((item) => item.id === draft.customerId);

              return (
                <div className="rounded-md border p-4" key={draft.id}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-medium">{draft.subject}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        To {draft.to} / {customer?.companyName ?? "Unknown company"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border bg-muted px-2 py-1 text-xs">{draft.status}</span>
                      {draft.status === "draft" ? <ApproveDraftAction draftId={draft.id} /> : null}
                    </div>
                  </div>
                  <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-5">
                    {draft.body}
                  </pre>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
