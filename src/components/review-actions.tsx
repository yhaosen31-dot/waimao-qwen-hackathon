"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function KeywordReviewAction({
  taskId,
  keywords
}: {
  taskId: string;
  keywords: string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(keywords.join("\n"));
  const [isSaving, setIsSaving] = useState(false);
  const parsedKeywords = useMemo(
    () => value.split("\n").map((item) => item.trim()).filter(Boolean),
    [value]
  );

  async function approveKeywords() {
    setIsSaving(true);

    await fetch(`/api/tasks/${taskId}/approve-keywords`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        keywords: parsedKeywords
      })
    });

    setIsSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Textarea value={value} onChange={(event) => setValue(event.target.value)} />
      <Button disabled={isSaving || parsedKeywords.length === 0} onClick={approveKeywords}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Approve keywords
      </Button>
    </div>
  );
}

export function ApproveAllDraftsAction({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function approveAll() {
    setIsSaving(true);

    await fetch("/api/drafts/approve-all", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ taskId })
    });

    setIsSaving(false);
    router.refresh();
  }

  return (
    <Button disabled={isSaving} onClick={approveAll}>
      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      Approve all drafts
    </Button>
  );
}

export function ApproveDraftAction({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function approveDraft() {
    setIsSaving(true);
    await fetch(`/api/drafts/${draftId}`, { method: "PATCH" });
    setIsSaving(false);
    router.refresh();
  }

  return (
    <Button disabled={isSaving} size="sm" variant="outline" onClick={approveDraft}>
      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      Approve
    </Button>
  );
}
