"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ForceEmailDraftButton({
  companyId,
  disabledReason,
  label = "强制生成草稿"
}: {
  companyId: string;
  disabledReason?: string;
  label?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generateDraft() {
    setSubmitting(true);
    setMessage(null);

    const response = await fetch(`/api/companies/${companyId}/generate-email-draft`, {
      method: "POST"
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      created?: boolean;
      message?: string;
      error?: string;
    };

    setSubmitting(false);
    if (!response.ok) {
      setMessage(payload.error ?? "生成草稿失败。");
      return;
    }

    setMessage(payload.message ?? (payload.created ? "已生成待审核草稿。" : "已有草稿。"));
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={submitting || Boolean(disabledReason)}
        onClick={generateDraft}
        size="sm"
        title={disabledReason}
        variant="outline"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {label}
      </Button>
      {disabledReason ? <div className="text-xs text-muted-foreground">{disabledReason}</div> : null}
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
  );
}
