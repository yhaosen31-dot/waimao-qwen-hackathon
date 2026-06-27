"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Info, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const targetCountries = ["美国", "德国", "墨西哥"];
const excludedCountries = ["中国", "俄罗斯", "伊朗"];

export function NewRunForm() {
  const router = useRouter();
  const [productInput, setProductInput] = useState("diaphragm accumulator");
  const [targetCustomerCount, setTargetCustomerCount] = useState(20);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/runs/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productInput,
          targetCount: targetCustomerCount
        })
      });

      if (!response.ok) throw new Error("Failed to start run.");

      const data = (await response.json()) as { runId: string };
      router.push(`/runs/${data.runId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid grid-cols-[112px_1fr] items-center gap-3">
        <Label className="whitespace-nowrap text-sm text-slate-700" htmlFor="productInput">
          产品名称
        </Label>
        <Input
          className="h-10 rounded-lg border-slate-200 bg-white text-sm"
          id="productInput"
          value={productInput}
          onChange={(event) => setProductInput(event.target.value)}
          placeholder="diaphragm accumulator"
        />
      </div>

      <div className="grid grid-cols-[112px_1fr] items-center gap-3">
        <Label className="whitespace-nowrap text-sm text-slate-700" htmlFor="targetCustomerCount">
          目标客户数量
        </Label>
        <Input
          className="h-10 rounded-lg border-slate-200 bg-white text-sm"
          id="targetCustomerCount"
          min={1}
          max={50}
          type="number"
          value={targetCustomerCount}
          onChange={(event) => setTargetCustomerCount(Number(event.target.value))}
        />
      </div>

      <TagSelect label="目标国家" values={targetCountries} />
      <TagSelect label="排除国家" values={excludedCountries} />

      <ToggleRow checked label="生成开发信草稿" />
      <ToggleRow checked label="允许发送邮件" mutedNote />

      <Button
        className="h-11 w-full rounded-lg bg-blue-600 text-sm font-semibold shadow-sm shadow-blue-200 hover:bg-blue-700"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        启动获客任务
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

function TagSelect({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-center gap-3">
      <div className="whitespace-nowrap text-sm text-slate-700">{label}</div>
      <div className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              className="inline-flex h-6 items-center gap-1 rounded-md bg-slate-100 px-2 text-xs text-slate-700"
              key={value}
            >
              {value}
              <X className="h-3 w-3 text-slate-400" />
            </span>
          ))}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  label,
  mutedNote
}: {
  checked: boolean;
  label: string;
  mutedNote?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-center gap-3">
      <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-700">
        {label}
        {mutedNote ? <Info className="h-3.5 w-3.5 text-slate-400" /> : null}
      </div>
      <label className="relative inline-flex w-fit cursor-pointer items-center">
        <input className="peer sr-only" defaultChecked={checked} type="checkbox" />
        <span
          className={cn(
            "h-5 w-9 rounded-full bg-slate-200 transition-colors peer-checked:bg-blue-600",
            "after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
          )}
        />
      </label>
    </div>
  );
}
