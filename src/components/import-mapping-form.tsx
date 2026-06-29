"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MailPlus, Save, Star, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ColumnMapping, ImportJobStatus } from "@/types";

type EnrichmentTarget = "default" | "missing_contacts" | "failed";

interface ImportMappingFormProps {
  importJobId: string;
  headers: string[];
  mapping: ColumnMapping | null;
  status: ImportJobStatus;
  importedCount: number;
}

export function ImportMappingForm({
  importJobId,
  headers,
  mapping,
  status,
  importedCount
}: ImportMappingFormProps) {
  const router = useRouter();
  const [companyNameColumn, setCompanyNameColumn] = useState(mapping?.companyNameColumn ?? "");
  const [countryColumn, setCountryColumn] = useState(mapping?.countryColumn ?? "");
  const [productDescriptionColumn, setProductDescriptionColumn] = useState(
    mapping?.productDescriptionColumn ?? ""
  );
  const [transactionSummaryColumn, setTransactionSummaryColumn] = useState(
    mapping?.transactionSummaryColumn ?? ""
  );
  const [sourceKeywordColumn, setSourceKeywordColumn] = useState(mapping?.sourceKeywordColumn ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [enrichmentStats, setEnrichmentStats] = useState<{
    target: EnrichmentTarget;
    total: number;
    eligible: number;
    concurrency: number;
    processed: number;
    remaining: number;
    completed: number;
    failed: number;
    websiteFound: number;
    websiteNotFound: number;
    emailsFound: number;
    whatsappFound: number;
    needsReviewCompanies: Array<{ id: string; name: string; reason: string }>;
    providerAttempts: Array<{
      provider: string;
      status: string;
      resultCount: number;
      averageConfidence?: number;
    }>;
  } | null>(null);
  const [buyerFitStats, setBuyerFitStats] = useState<{
    total: number;
    processed: number;
    remaining: number;
    scored: number;
    failed: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
    manualReview: number;
    needsManualReviewCompanies: Array<{ id: string; name: string; reason: string }>;
  } | null>(null);
  const [emailDraftStats, setEmailDraftStats] = useState<{
    processed: number;
    generated: number;
    skippedLowOrSkip: number;
    skippedNoEmail: number;
    skippedExisting: number;
    failed: number;
    generatedCompanies: Array<{ id: string; name: string; toEmail: string }>;
    skippedCompanies: Array<{ id: string; name: string; reason: string }>;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isStartingEnrichment, setIsStartingEnrichment] = useState(false);
  const [isScoringBuyerFit, setIsScoringBuyerFit] = useState(false);
  const [isGeneratingEmails, setIsGeneratingEmails] = useState(false);

  async function saveMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const response = await fetch(`/api/imports/${importJobId}/mapping`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        companyNameColumn,
        countryColumn,
        productDescriptionColumn,
        transactionSummaryColumn,
        sourceKeywordColumn
      })
    });
    const payload = (await response.json()) as { error?: string };

    setIsSaving(false);
    if (!response.ok) {
      setMessage(payload.error ?? "字段映射保存失败。");
      return;
    }

    setMessage("字段映射已保存，统计已重新计算。");
    router.refresh();
  }

  async function confirmImport() {
    setIsConfirming(true);
    setMessage("正在保存候选客户到 CRM，请稍等。");

    const response = await fetch(`/api/imports/${importJobId}/confirm`, {
      method: "POST"
    });
    const payload = (await response.json()) as {
      imported?: number;
      message?: string;
      error?: string;
    };

    setIsConfirming(false);
    if (!response.ok) {
      setMessage(payload.error ?? "确认导入失败。");
      return;
    }

    setMessage(`已保存 ${payload.imported ?? importedCount} 个候选客户。下一步可以开始补全官网和联系方式。`);
    router.refresh();
  }

  async function startEnrichmentBatched(force = false, target: EnrichmentTarget = "default") {
    setIsStartingEnrichment(true);
    setMessage(enrichmentStartMessage(target));

    const cumulativeStats = {
      target,
      total: 0,
      eligible: 0,
      concurrency: 1,
      processed: 0,
      remaining: 0,
      completed: 0,
      failed: 0,
      websiteFound: 0,
      websiteNotFound: 0,
      emailsFound: 0,
      whatsappFound: 0,
      needsReviewCompanies: [] as Array<{ id: string; name: string; reason: string }>,
      providerAttempts: [] as Array<{
        provider: string;
        status: string;
        resultCount: number;
        averageConfidence?: number;
      }>
    };

    try {
      for (let batchIndex = 0; batchIndex < 150; batchIndex += 1) {
        setMessage(`正在补全第 ${batchIndex + 1} 批，每批最多 5 家客户。开启队列时可离开当前页面。`);
        const response = await fetch(`/api/imports/${importJobId}/enrich`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            force,
            target,
            limit: 5,
            offset: force ? cumulativeStats.processed : 0
          })
        });
        const payload = (await response.json()) as {
          error?: string;
          queued?: boolean;
          runId?: string;
          jobId?: string;
          message?: string;
          stats?: typeof enrichmentStats;
        };

        if (response.ok && payload.queued) {
          setMessage(payload.message ?? "补全任务已进入后台队列，正在打开任务进度页。");
          if (payload.runId) router.push(`/runs/${payload.runId}`);
          break;
        }

        if (!response.ok || !payload.stats) {
          setMessage(payload.error ?? "补全失败，请稍后重试。");
          break;
        }

        cumulativeStats.total = payload.stats.total;
        cumulativeStats.eligible = payload.stats.eligible;
        cumulativeStats.concurrency = payload.stats.concurrency;
        cumulativeStats.processed += payload.stats.processed;
        cumulativeStats.remaining = payload.stats.remaining;
        cumulativeStats.completed += payload.stats.completed;
        cumulativeStats.failed += payload.stats.failed;
        cumulativeStats.websiteFound += payload.stats.websiteFound;
        cumulativeStats.websiteNotFound += payload.stats.websiteNotFound;
        cumulativeStats.emailsFound += payload.stats.emailsFound;
        cumulativeStats.whatsappFound += payload.stats.whatsappFound;
        cumulativeStats.needsReviewCompanies = [
          ...cumulativeStats.needsReviewCompanies,
          ...payload.stats.needsReviewCompanies
        ];
        cumulativeStats.providerAttempts = [
          ...cumulativeStats.providerAttempts,
          ...payload.stats.providerAttempts
        ];

        setEnrichmentStats({ ...cumulativeStats });
        setMessage(
          `补全进行中：本次已处理 ${cumulativeStats.processed} 家，剩余 ${cumulativeStats.remaining} 家。`
        );
        router.refresh();

        if (payload.stats.remaining <= 0 || payload.stats.processed === 0) break;
      }
    } finally {
      setMessage((current) =>
        current?.startsWith("补全进行中")
          ? `${current} 本轮补全已结束，可以查看上方统计和客户列表。`
          : current
      );
      setIsStartingEnrichment(false);
    }
  }

  async function scoreBuyerFitBatched() {
    setIsScoringBuyerFit(true);
    setMessage("正在启动 Buyer Fit 评分。开启队列时可离开当前页面。");

    try {
      for (let batchIndex = 0; batchIndex < 100; batchIndex += 1) {
        const response = await fetch(`/api/imports/${importJobId}/score-buyer-fit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ limit: 2 })
        });
        const payload = (await response.json()) as {
          error?: string;
          queued?: boolean;
          runId?: string;
          jobId?: string;
          message?: string;
          stats?: typeof buyerFitStats;
        };

        if (response.ok && payload.queued) {
          setMessage(payload.message ?? "Buyer Fit 评分已进入后台队列，正在打开任务进度页。");
          if (payload.runId) router.push(`/runs/${payload.runId}`);
          break;
        }

        if (!response.ok || !payload.stats) {
          setMessage(payload.error ?? "Buyer Fit 评分失败，请稍后重试。");
          break;
        }

        setBuyerFitStats(payload.stats);
        setMessage(`Buyer Fit 评分已完成 ${payload.stats.scored}/${payload.stats.total}，剩余 ${payload.stats.remaining} 个。`);
        router.refresh();

        if (payload.stats.remaining <= 0 || payload.stats.processed === 0) break;
      }
    } finally {
      setIsScoringBuyerFit(false);
    }
  }

  async function generateEmailDrafts() {
    setIsGeneratingEmails(true);
    setMessage("正在生成开发信草稿。草稿会进入人工审核，不会自动发送。");

    const response = await fetch(`/api/imports/${importJobId}/generate-email-drafts`, {
      method: "POST"
    });
    const payload = (await response.json()) as {
      queued?: boolean;
      runId?: string;
      jobId?: string;
      message?: string;
      error?: string;
      stats?: typeof emailDraftStats;
    };

    setIsGeneratingEmails(false);
    if (response.ok && payload.queued) {
      setMessage(payload.message ?? "开发信草稿生成已进入后台队列，正在打开任务进度页。");
      if (payload.runId) router.push(`/runs/${payload.runId}`);
      return;
    }
    if (payload.stats) setEmailDraftStats(payload.stats);
    setMessage(payload.message ?? payload.error ?? "开发信草稿生成完成。");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={saveMapping}>
        <SelectField
          id="companyNameColumn"
          label="公司名称列"
          onChange={setCompanyNameColumn}
          options={headers}
          required
          value={companyNameColumn}
        />
        <SelectField
          id="countryColumn"
          label="国家列"
          onChange={setCountryColumn}
          options={headers}
          value={countryColumn}
        />
        <SelectField
          id="productDescriptionColumn"
          label="产品描述列"
          onChange={setProductDescriptionColumn}
          options={headers}
          value={productDescriptionColumn}
        />
        <SelectField
          id="transactionSummaryColumn"
          label="交易记录列"
          onChange={setTransactionSummaryColumn}
          options={headers}
          value={transactionSummaryColumn}
        />
        <SelectField
          id="sourceKeywordColumn"
          label="来源关键词列"
          onChange={setSourceKeywordColumn}
          options={headers}
          value={sourceKeywordColumn}
        />
        <div className="flex items-end">
          <Button disabled={isSaving || !companyNameColumn} type="submit" variant="outline">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存字段映射
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-3">
        <Button disabled={isConfirming || !companyNameColumn || importedCount > 0} onClick={confirmImport}>
          {isConfirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          确认导入
        </Button>
        <Button
          disabled={isStartingEnrichment || status !== "imported"}
          onClick={() => startEnrichmentBatched(false)}
          variant="outline"
        >
          {isStartingEnrichment ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          开始补全官网和联系方式
        </Button>
        <Button
          disabled={isStartingEnrichment || status !== "imported"}
          onClick={() => startEnrichmentBatched(true)}
          variant="outline"
        >
          {isStartingEnrichment ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          重新扫描邮箱和 WhatsApp
        </Button>
        <Button
          disabled={isStartingEnrichment || status !== "imported"}
          onClick={() => startEnrichmentBatched(false, "missing_contacts")}
          variant="outline"
        >
          {isStartingEnrichment ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          只补全缺邮箱/WhatsApp
        </Button>
        <Button
          disabled={isStartingEnrichment || status !== "imported"}
          onClick={() => startEnrichmentBatched(false, "failed")}
          variant="outline"
        >
          {isStartingEnrichment ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          只重试失败客户
        </Button>
        <Button
          disabled={isScoringBuyerFit || status !== "imported"}
          onClick={scoreBuyerFitBatched}
          variant="outline"
        >
          {isScoringBuyerFit ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Star className="h-4 w-4" />
          )}
          开始 Buyer Fit 评分
        </Button>
        <Button
          disabled={isGeneratingEmails || status !== "imported"}
          onClick={generateEmailDrafts}
          variant="outline"
        >
          {isGeneratingEmails ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MailPlus className="h-4 w-4" />
          )}
          生成开发信草稿
        </Button>
      </div>

      {message ? <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
      {enrichmentStats ? (
        <div className="grid gap-2 rounded-md border bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-3">
          <div>总客户：{enrichmentStats.total}</div>
          <div>符合条件：{enrichmentStats.eligible}</div>
          <div>并发：{enrichmentStats.concurrency}</div>
          <div>剩余：{enrichmentStats.remaining}</div>
          <div>已处理：{enrichmentStats.processed}</div>
          <div>已完成：{enrichmentStats.completed}</div>
          <div>失败：{enrichmentStats.failed}</div>
          <div>找到官网：{enrichmentStats.websiteFound}</div>
          <div>未找到官网：{enrichmentStats.websiteNotFound}</div>
          <div>邮箱：{enrichmentStats.emailsFound}</div>
          <div>WhatsApp：{enrichmentStats.whatsappFound}</div>
          <div>需人工确认：{enrichmentStats.needsReviewCompanies.length}</div>
          <div>
            Provider：
            {enrichmentStats.providerAttempts.find((attempt) => attempt.status !== "skipped")?.provider ??
              "-"}
          </div>
        </div>
      ) : null}
      {buyerFitStats ? (
        <div className="grid gap-2 rounded-md border bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-4">
          <div>总数：{buyerFitStats.total}</div>
          <div>剩余：{buyerFitStats.remaining}</div>
          <div>本次处理：{buyerFitStats.processed}</div>
          <div>已评分：{buyerFitStats.scored}</div>
          <div>失败：{buyerFitStats.failed}</div>
          <div>High：{buyerFitStats.high}</div>
          <div>Medium：{buyerFitStats.medium}</div>
          <div>Low：{buyerFitStats.low}</div>
          <div>Unknown：{buyerFitStats.unknown}</div>
          <div>Manual review：{buyerFitStats.manualReview}</div>
        </div>
      ) : null}
      {emailDraftStats ? (
        <div className="grid gap-2 rounded-md border bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-3">
          <div>已处理：{emailDraftStats.processed}</div>
          <div>已生成：{emailDraftStats.generated}</div>
          <div>失败：{emailDraftStats.failed}</div>
          <div>low/skip 跳过：{emailDraftStats.skippedLowOrSkip}</div>
          <div>无邮箱跳过：{emailDraftStats.skippedNoEmail}</div>
          <div>已有草稿跳过：{emailDraftStats.skippedExisting}</div>
        </div>
      ) : null}
    </div>
  );
}

function enrichmentStartMessage(target: EnrichmentTarget) {
  if (target === "missing_contacts") {
    return "正在启动精准补全：只处理缺邮箱或 WhatsApp 的客户。";
  }

  if (target === "failed") {
    return "正在启动失败重试：只处理补全失败的客户。";
  }

  return "正在启动补全流程。开启队列时会交给后台 worker 继续执行。";
}

function SelectField({
  id,
  label,
  onChange,
  options,
  required,
  value
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  required?: boolean;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        value={value}
      >
        <option value="">不映射</option>
        {options.map((option) => (
          <option key={`${id}-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
