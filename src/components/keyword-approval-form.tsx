"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Keyword } from "@/types";

export function KeywordApprovalForm({
  runId,
  keywords
}: {
  runId: string;
  keywords: Keyword[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(() => new Set(keywords.map((keyword) => keyword.id)));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  function toggleKeyword(keywordId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(keywordId)) {
        next.delete(keywordId);
      } else {
        next.add(keywordId);
      }
      return next;
    });
  }

  async function approve() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/runs/${runId}/approve-keywords`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          keywordIds: Array.from(selectedIds)
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "关键词确认失败，请稍后重试。");
      }

      router.push(`/runs/${runId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {keywords.map((keyword) => (
          <label
            className="flex flex-wrap items-center gap-3 rounded-md border bg-white p-3 text-sm hover:bg-muted/50"
            key={keyword.id}
          >
            <input
              checked={selectedIds.has(keyword.id)}
              className="h-4 w-4 rounded border-input"
              type="checkbox"
              onChange={() => toggleKeyword(keyword.id)}
            />
            <span className="font-medium">{keyword.value}</span>
            <span className="ml-auto rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
              {Math.round((keyword.confidence ?? 0) * 100)}%
            </span>
            {keyword.reason ? (
              <span className="w-full pl-7 text-xs leading-5 text-muted-foreground">
                {keyword.reason}
              </span>
            ) : null}
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          已选择 {selectedCount} 个关键词
        </p>
        <Button disabled={isSubmitting || selectedCount === 0} onClick={approve}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          确认关键词并继续
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
