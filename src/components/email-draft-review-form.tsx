"use client";

import { EmailDraftActionPanel } from "@/components/email-draft-action-panel";
import type { EmailDraft } from "@/types";

export function EmailDraftReviewForm({
  drafts
}: {
  runId: string;
  drafts: EmailDraft[];
}) {
  return (
    <div className="space-y-4">
      {drafts.map((draft, index) => (
        <div className="rounded-md border bg-white p-4" key={draft.id}>
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-medium">Draft {index + 1}</div>
              <div className="text-xs text-muted-foreground">
                {draft.companyId} / {draft.toEmail ?? "no email"}
              </div>
            </div>
            <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium">
              {draft.status}
            </span>
          </div>
          <EmailDraftActionPanel draft={draft} />
        </div>
      ))}
      <div className="text-sm text-muted-foreground">
        {drafts.filter((item) => item.status === "approved").length} approved /{" "}
        {drafts.filter((item) => item.status === "skipped").length} skipped /{" "}
        {drafts.filter((item) => item.status === "draft" || item.status === "waiting_review").length} pending
      </div>
    </div>
  );
}
