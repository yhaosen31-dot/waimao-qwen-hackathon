"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EmailDraft } from "@/types";

interface DraftFormState {
  id: string;
  companyId: string;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailDraft["status"];
}

type ActionType = "approve" | "skip" | "save_draft";

export function EmailDraftReviewForm({
  drafts
}: {
  runId: string;
  drafts: EmailDraft[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<DraftFormState[]>(
    drafts.map((draft) => ({
      id: draft.id,
      companyId: draft.companyId,
      toEmail: draft.toEmail ?? "procurement@example.com",
      subject: draft.subject,
      body: draft.body,
      status: draft.status
    }))
  );
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateItem(id: string, patch: Partial<DraftFormState>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function submitAction(item: DraftFormState, action: ActionType) {
    setSubmittingId(`${item.id}:${action}`);
    setError(null);

    const endpoint =
      action === "approve"
        ? "/api/reviews/email/approve"
        : action === "skip"
          ? "/api/reviews/email/skip"
          : "/api/reviews/email/save-draft";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          draftId: item.id,
          subject: item.subject,
          body: item.body
        })
      });

      if (!response.ok) throw new Error("Failed to update email draft.");

      updateItem(item.id, {
        status:
          action === "approve" ? "approved" : action === "skip" ? "skipped" : "draft"
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div className="rounded-md border bg-white p-4" key={item.id}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-medium">Draft {index + 1}</div>
              <div className="text-xs text-muted-foreground">
                {item.companyId} / {item.toEmail}
              </div>
            </div>
            <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium">
              {item.status}
            </span>
          </div>
          <input
            className="mt-3 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={item.subject}
            onChange={(event) => updateItem(item.id, { subject: event.target.value })}
          />
          <Textarea
            className="mt-3 min-h-40"
            value={item.body}
            onChange={(event) => updateItem(item.id, { body: event.target.value })}
          />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              disabled={submittingId !== null}
              size="sm"
              variant="outline"
              onClick={() => submitAction(item, "save_draft")}
            >
              {submittingId === `${item.id}:save_draft` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存草稿
            </Button>
            <Button
              disabled={submittingId !== null}
              size="sm"
              variant="outline"
              onClick={() => submitAction(item, "skip")}
            >
              {submittingId === `${item.id}:skip` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SkipForward className="h-4 w-4" />
              )}
              跳过
            </Button>
            <Button
              disabled={submittingId !== null}
              size="sm"
              onClick={() => submitAction(item, "approve")}
            >
              {submittingId === `${item.id}:approve` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              批准
            </Button>
          </div>
        </div>
      ))}
      <div className="text-sm text-muted-foreground">
        {items.filter((item) => item.status === "approved").length} approved /{" "}
        {items.filter((item) => item.status === "skipped").length} skipped /{" "}
        {items.filter((item) => item.status === "draft" || item.status === "waiting_review").length} pending
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
