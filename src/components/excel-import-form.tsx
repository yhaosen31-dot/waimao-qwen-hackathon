"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ExcelImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setMessage("请选择 .xlsx、.xls 或 .csv 文件。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData();
    formData.set("file", file);

    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => ({}))) as {
        importJobId?: string;
        error?: string;
      };

      if (!response.ok) {
        setMessage(payload.error ?? "导入失败，请稍后重试。");
        return;
      }

      if (payload.importJobId) {
        router.push(`/imports/${payload.importJobId}`);
        return;
      }

      setMessage("解析完成，但没有返回导入任务 ID。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="excel-file">Excel / CSV 文件</Label>
        <Input
          accept=".xlsx,.xls,.csv"
          id="excel-file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          type="file"
        />
        {file ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <FileSpreadsheet className="h-4 w-4 text-blue-600" />
            {file.name}
          </div>
        ) : null}
      </div>
      <Button className="w-full bg-blue-600 hover:bg-blue-700" disabled={isSubmitting} type="submit">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        解析表格
      </Button>
      {message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{message}</div> : null}
    </form>
  );
}
