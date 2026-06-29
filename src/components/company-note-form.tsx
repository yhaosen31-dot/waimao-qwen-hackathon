"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CompanyNoteFormProps {
  companyId: string;
}

export function CompanyNoteForm({ companyId }: CompanyNoteFormProps) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitNote() {
    const nextContent = content.trim();
    if (!nextContent) {
      setMessage("请输入备注内容。");
      return;
    }

    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/companies/${companyId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextContent })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "保存备注失败。");
        return;
      }

      setContent("");
      setMessage("备注已保存。");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        disabled={isPending}
        onChange={(event) => setContent(event.target.value)}
        placeholder="记录跟进情况、客户偏好、人工判断..."
        value={content}
      />
      <div className="flex items-center gap-3">
        <Button disabled={isPending} onClick={submitNote} type="button">
          添加备注
        </Button>
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      </div>
    </div>
  );
}
