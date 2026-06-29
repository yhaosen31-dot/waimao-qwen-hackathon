"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCcw, Save, SendHorizontal, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EmailDraft } from "@/types";

export function EmailDraftActionPanel({
  compact,
  draft
}: {
  compact?: boolean;
  draft: EmailDraft;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [status, setStatus] = useState(draft.status);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const reviewActionDisabled = status === "sent";

  async function submit(action: "save" | "approve" | "skip" | "regenerate") {
    setSubmitting(action);
    setMessage(null);

    const response = await fetch(`/api/email-drafts/${draft.id}/${action}`, {
      method: "POST",
      headers: action === "regenerate" ? undefined : { "Content-Type": "application/json" },
      body:
        action === "regenerate"
          ? undefined
          : JSON.stringify({
              subject,
              body
            })
    });
    const payload = (await response.json()) as {
      emailDraft?: EmailDraft;
      error?: string;
    };

    setSubmitting(null);
    if (!response.ok) {
      setMessage(payload.error ?? "操作失败。");
      return;
    }

    if (payload.emailDraft) {
      setSubject(payload.emailDraft.subject);
      setBody(payload.emailDraft.body);
      setStatus(payload.emailDraft.status);
    } else {
      setStatus(action === "approve" ? "approved" : action === "skip" ? "skipped" : "draft");
    }
    setMessage(action === "regenerate" ? "已重新生成。" : "已保存状态。");
    router.refresh();
  }

  async function sendDraft() {
    if (!window.confirm("确认发送这封邮件？发送后会记录到客户跟进记录。")) return;

    setSubmitting("send");
    setMessage(null);

    const response = await fetch(`/api/email-drafts/${draft.id}/send`, {
      method: "POST"
    });
    const payload = (await response.json()) as {
      emailDraft?: EmailDraft;
      error?: string;
      mode?: "mock" | "real";
    };

    setSubmitting(null);
    if (payload.emailDraft) {
      setStatus(payload.emailDraft.status);
    }

    if (!response.ok) {
      setMessage(payload.error ?? payload.emailDraft?.errorMessage ?? "发送失败。");
      return;
    }

    setMessage(payload.mode === "mock" ? "Mock send completed. No real email was sent." : "邮件已发送。");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <input
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => setSubject(event.target.value)}
        value={subject}
      />
      <Textarea
        className={compact ? "min-h-32" : "min-h-52"}
        onChange={(event) => setBody(event.target.value)}
        value={body}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium">{status}</span>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            action="save"
            icon={Save}
            label="保存草稿"
            onClick={submit}
            disabled={reviewActionDisabled}
            submitting={submitting}
            variant="outline"
          />
          <ActionButton
            action="approve"
            icon={CheckCircle2}
            label="批准"
            onClick={submit}
            disabled={reviewActionDisabled}
            submitting={submitting}
          />
          <ActionButton
            action="skip"
            icon={SkipForward}
            label="跳过"
            onClick={submit}
            disabled={reviewActionDisabled}
            submitting={submitting}
            variant="outline"
          />
          <ActionButton
            action="regenerate"
            icon={RefreshCcw}
            label="重新生成"
            onClick={submit}
            disabled={reviewActionDisabled}
            submitting={submitting}
            variant="outline"
          />
          {status === "approved" ? (
            <Button disabled={submitting !== null} onClick={sendDraft} size="sm">
              {submitting === "send" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
              发送
            </Button>
          ) : null}
          {status === "sent" ? (
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              已发送
            </span>
          ) : null}
        </div>
      </div>
      {status === "failed" && draft.errorMessage ? (
        <div className="text-sm text-destructive">失败原因：{draft.errorMessage}</div>
      ) : null}
      {message ? <div className="text-sm text-muted-foreground">{message}</div> : null}
    </div>
  );
}

function ActionButton({
  action,
  icon: Icon,
  label,
  onClick,
  disabled,
  submitting,
  variant
}: {
  action: "save" | "approve" | "skip" | "regenerate";
  icon: typeof Save;
  label: string;
  onClick: (action: "save" | "approve" | "skip" | "regenerate") => void;
  disabled?: boolean;
  submitting: string | null;
  variant?: "outline";
}) {
  return (
    <Button disabled={disabled || submitting !== null} onClick={() => onClick(action)} size="sm" variant={variant}>
      {submitting === action ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
