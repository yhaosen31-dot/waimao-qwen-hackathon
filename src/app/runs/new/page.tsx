import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  ExternalLink,
  Eye,
  FileText,
  Globe2,
  Mail,
  MessageCircle,
  Rocket,
  Save,
  Send,
  Star,
  Table2,
  TrendingUp,
  Users
} from "lucide-react";
import { NewRunForm } from "@/components/new-run-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRunResults, listCompanies, listRuns, readStore } from "@/lib/store";
import { cn, formatDateTime } from "@/lib/utils";
import type {
  Company,
  EmailAddress,
  EmailDraft,
  Evidence,
  LeadGenerationStepKey,
  RunResults,
  RunStepStatus,
  WhatsappNumber
} from "@/types";

export const dynamic = "force-dynamic";

const workflowOrder: LeadGenerationStepKey[] = [
  "normalizeInput",
  "generateKeywords",
  "humanApproveKeywords",
  "searchCrossBorderImporters",
  "extractCompanyDetails",
  "discoverWebsite",
  "searchEmailsByDomain",
  "discoverWhatsappAndContacts",
  "scoreBuyerFit",
  "generateEmailDraft",
  "humanApproveEmail",
  "saveEmailDraft",
  "saveToCrm"
];

const workflowLabels: Record<LeadGenerationStepKey, string> = {
  normalizeInput: "标准化输入",
  generateKeywords: "生成英文关键词",
  humanApproveKeywords: "人工确认关键词",
  searchCrossBorderImporters: "跨境搜一键搜",
  extractCompanyDetails: "提取企业详情",
  discoverWebsite: "官网发现/确认",
  searchEmailsByDomain: "外贸邮箱查询",
  discoverWhatsappAndContacts: "搜索 WhatsApp",
  scoreBuyerFit: "客户匹配评分",
  generateEmailDraft: "生成开发信草稿",
  humanApproveEmail: "人工确认邮件",
  saveEmailDraft: "发送/保存",
  saveToCrm: "入库 CRM"
};

export default async function NewRunPage() {
  const [runs, allCompanies, db] = await Promise.all([listRuns(), listCompanies(), readStore()]);
  const latestRun = runs[0];
  const latestResults = latestRun ? await getRunResults(latestRun.id) : null;
  const companies =
    latestResults && latestResults.companies.length > 0
      ? latestResults.companies
      : allCompanies.slice(0, 20);
  const selectedCompany = companies[0];
  const selectedEmail = selectedCompany
    ? db.emailAddresses.find((item) => item.companyId === selectedCompany.id)
    : undefined;
  const selectedWhatsapp = selectedCompany
    ? db.whatsappNumbers.find((item) => item.companyId === selectedCompany.id)
    : undefined;
  const selectedDraft = selectedCompany
    ? db.emailDrafts.find((item) => item.companyId === selectedCompany.id)
    : db.emailDrafts[0];
  const selectedEvidence = selectedCompany
    ? db.evidence.filter((item) => item.companyId === selectedCompany.id)
    : [];
  const highFitCount = companies.filter((company) => (company.buyerFitScore ?? 0) >= 85).length;
  const runWhatsappNumbers = latestResults?.whatsappNumbers ?? db.whatsappNumbers;
  const draftCount = latestResults?.emailDrafts.length ?? db.emailDrafts.length;
  const whatsappCount = new Set(runWhatsappNumbers.map((item) => item.companyId)).size;
  const completedSteps =
    latestResults?.runSteps.filter((step) => step.status === "completed").length ?? 0;
  const progress =
    latestResults && latestResults.runSteps.length > 0
      ? Math.round((completedSteps / latestResults.runSteps.length) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[360px_minmax(520px,1fr)] 2xl:grid-cols-[360px_minmax(520px,1fr)_344px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle number="1" title="创建获客任务" />
          <div className="mt-5">
            <NewRunForm />
          </div>
        </div>

        <div
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          id="workflow"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle number="2" title="LangGraph 工作流进度" />
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <LegendItem className="bg-emerald-500" label="已完成" />
              <LegendItem className="bg-blue-600" label="运行中" />
              <LegendItem className="border border-slate-400 bg-white" label="待执行" />
            </div>
          </div>
          <WorkflowPanel results={latestResults} />
        </div>

        <div
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2 2xl:col-span-1"
          id="review"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">人工审核中心</h2>
            {latestRun ? (
              <Link
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600"
                href={`/runs/${latestRun.id}`}
              >
                进入
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <ReviewCenter results={latestResults} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[repeat(4,minmax(150px,1fr))_minmax(320px,1.5fr)]">
        <MetricCard delta="+128" label="候选客户" value={companies.length || 0} />
        <MetricCard delta="+27" label="高匹配客户" value={highFitCount} />
        <MetricCard delta="+19" label="已生成邮件草稿" value={draftCount} />
        <MetricCard delta="+14" label="已发现 WhatsApp" value={whatsappCount} />
        <ProgressMetric progress={progress} runStatus={latestResults?.run.status ?? "created"} />
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(620px,1.15fr)_360px_376px]">
        <CustomerTable
          companies={companies}
          emailAddresses={db.emailAddresses}
          whatsappNumbers={db.whatsappNumbers}
        />
        <CompanyInsight
          company={selectedCompany}
          draft={selectedDraft}
          email={selectedEmail}
          evidence={selectedEvidence}
          whatsapp={selectedWhatsapp}
        />
        <EmailPreview draft={selectedDraft} />
      </section>

      {latestRun ? (
        <div className="text-xs text-slate-500">
          最近任务：{latestRun.normalizedProduct ?? latestRun.productInput} ·{" "}
          {formatDateTime(latestRun.createdAt)} · 本页所有外部服务仍为 mock 模式
        </div>
      ) : null}
    </div>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-sm font-semibold text-white shadow-sm shadow-blue-200">
        {number}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}

function LegendItem({
  className,
  label
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function WorkflowPanel({ results }: { results: RunResults | null }) {
  const stepByKey = new Map(results?.runSteps.map((step) => [step.stepKey, step]));
  const completedDraftSave = Boolean(
    results?.emailDrafts.some((draft) =>
      ["approved", "saved", "skipped"].includes(draft.status)
    )
  );

  return (
    <div className="mt-6 grid gap-x-4 gap-y-7 md:grid-cols-3 2xl:grid-cols-5">
      {workflowOrder.map((stepKey, index) => {
        const storedStatus = stepByKey.get(stepKey)?.status;
        const status =
          stepKey === "saveEmailDraft" && completedDraftSave
            ? "completed"
            : storedStatus ?? "pending";

        return (
          <div className="relative" key={stepKey}>
            <WorkflowNode index={index + 1} label={workflowLabels[stepKey]} status={status} />
            {index < workflowOrder.length - 1 ? (
              <ArrowRight className="absolute -right-5 top-6 hidden h-4 w-4 text-slate-300 2xl:block" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function WorkflowNode({
  index,
  label,
  status
}: {
  index: number;
  label: string;
  status: RunStepStatus;
}) {
  const isCompleted = status === "completed";
  const isRunning = status === "running";
  const isReview = status === "waiting_review" || status === "paused";
  const isFailed = status === "failed";

  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shadow-sm",
          isCompleted && "bg-emerald-500 text-white shadow-emerald-100",
          isRunning && "bg-blue-600 text-white shadow-blue-100",
          isReview && "bg-amber-500 text-white shadow-amber-100",
          isFailed && "bg-red-500 text-white shadow-red-100",
          !isCompleted &&
            !isRunning &&
            !isReview &&
            !isFailed &&
            "border border-slate-300 bg-white text-slate-500"
        )}
      >
        {isCompleted ? <Check className="h-4 w-4" /> : index}
      </span>
      <div className="flex min-h-12 w-full items-center justify-center rounded-lg bg-slate-50 px-3 text-center text-xs font-medium text-slate-700">
        {label}
      </div>
    </div>
  );
}

function ReviewCenter({ results }: { results: RunResults | null }) {
  const keywordWaiting = results?.runSteps.some(
    (step) => step.stepKey === "humanApproveKeywords" && step.status === "waiting_review"
  );
  const emailWaiting = results?.runSteps.some(
    (step) => step.stepKey === "humanApproveEmail" && step.status === "waiting_review"
  );
  const rows = [
    {
      icon: Rocket,
      label: "关键词审核",
      count: keywordWaiting ? 1 : 0,
      tone: "purple"
    },
    {
      icon: Globe2,
      label: "官网确认",
      count: 2,
      tone: "green"
    },
    {
      icon: Mail,
      label: "邮件确认",
      count: emailWaiting ? results?.emailDrafts.length ?? 0 : 3,
      tone: "orange"
    }
  ];

  return (
    <div className="mt-7 space-y-4">
      {rows.map((row) => (
        <div className="flex items-center justify-between rounded-lg p-3 hover:bg-slate-50" key={row.label}>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-lg",
                row.tone === "purple" && "bg-violet-100 text-violet-600",
                row.tone === "green" && "bg-emerald-100 text-emerald-600",
                row.tone === "orange" && "bg-orange-100 text-orange-600"
              )}
            >
              <row.icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-slate-700">{row.label}</span>
          </div>
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-orange-50 px-2 text-sm font-semibold text-orange-600">
            {row.count}
          </span>
        </div>
      ))}
      <div className="border-t border-slate-100 pt-4 text-center">
        {results ? (
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600"
            href={`/runs/${results.run.id}`}
          >
            查看全部待审核任务
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="text-sm text-slate-500">启动任务后显示待审核项</span>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  delta,
  label,
  value
}: {
  delta: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-600">{label}</div>
      <div className="mt-4 text-3xl font-semibold tracking-normal text-slate-950">{value}</div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-slate-500">较昨日</span>
        <span className="font-medium text-emerald-600">{delta}</span>
        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
      </div>
    </div>
  );
}

function ProgressMetric({ progress, runStatus }: { progress: number; runStatus: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-600">任务进度</div>
        <Badge variant={runStatus === "completed" ? "success" : "secondary"}>
          {runStatus === "completed" ? "已完成" : "运行中"}
        </Badge>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-normal text-slate-950">{progress}%</div>
      <div className="mt-3 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 text-xs text-slate-500">已用时 1h 23m / 预计 3h 00m</div>
    </div>
  );
}

function CustomerTable({
  companies,
  emailAddresses,
  whatsappNumbers
}: {
  companies: Company[];
  emailAddresses: EmailAddress[];
  whatsappNumbers: WhatsappNumber[];
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
        <h2 className="font-semibold">客户列表（部分）</h2>
        <Table2 className="h-4 w-4 text-slate-400" />
      </div>
      {companies.length === 0 ? (
        <div className="p-8 text-sm text-slate-500">暂无客户。点击启动获客任务生成 mock 客户。</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <span className="sr-only">选择</span>
                </TableHead>
                <TableHead>公司名称</TableHead>
                <TableHead>国家</TableHead>
                <TableHead>官网</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>评分</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.slice(0, 6).map((company, index) => {
                const email = emailAddresses.find((item) => item.companyId === company.id);
                const whatsapp = whatsappNumbers.find((item) => item.companyId === company.id);
                const score = company.buyerFitScore ?? 0;
                return (
                  <TableRow key={company.id}>
                    <TableCell>
                      <input
                        aria-label={`选择 ${company.name}`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                        defaultChecked={index === 0}
                        type="checkbox"
                      />
                    </TableCell>
                    <TableCell>
                      <Link className="font-medium text-blue-600" href={`/companies/${company.id}`}>
                        {company.name}
                      </Link>
                    </TableCell>
                    <TableCell>{company.country ?? "-"}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-blue-600">
                      {company.domain ?? company.website ?? "-"}
                    </TableCell>
                    <TableCell className="max-w-[190px] truncate text-blue-600">
                      {email?.email ?? "-"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {whatsapp?.number ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        {score}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-medium",
                          score >= 85
                            ? "bg-emerald-50 text-emerald-700"
                            : score >= 70
                              ? "bg-orange-50 text-orange-700"
                              : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {score >= 85 ? "高匹配" : score >= 70 ? "中匹配" : "待确认"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>共 {companies.length} 条</span>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700">
                1
              </span>
              <span>2</span>
              <span>3</span>
              <span>...</span>
              <span>10 条/页</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CompanyInsight({
  company,
  draft,
  email,
  evidence,
  whatsapp
}: {
  company?: Company;
  draft?: EmailDraft;
  email?: EmailAddress;
  evidence: Evidence[];
  whatsapp?: WhatsappNumber;
}) {
  if (!company) {
    return (
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        暂无选中客户。
      </div>
    );
  }

  const reasons = company.buyerFitReasons.length > 0 ? company.buyerFitReasons : ["产品关键词匹配", "存在公开联系信息"];
  const score = company.buyerFitScore ?? 0;
  const scoreLabel = score >= 85 ? "高匹配" : score >= 70 ? "中匹配" : "待确认";

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{company.name}</h2>
            <span
              className={cn(
                "rounded-md px-2 py-1 text-xs font-semibold",
                score >= 85
                  ? "bg-emerald-50 text-emerald-700"
                  : score >= 70
                    ? "bg-orange-50 text-orange-700"
                    : "bg-slate-100 text-slate-600"
              )}
            >
              {score} {scoreLabel}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{company.industry ?? "Industrial hydraulics"}</div>
        </div>
        <CircleDot className="h-5 w-5 text-slate-400" />
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <InsightLine icon={Globe2} label="官网" value={company.website ?? "-"} link />
        <InsightLine icon={Mail} label="邮箱" value={email?.email ?? "-"} />
        <InsightLine icon={MessageCircle} label="WhatsApp" value={whatsapp?.number ?? "-"} />
        <InsightLine icon={Building2} label="国家/地区" value={company.country ?? "-"} />
      </div>

      <div className="mt-4 flex items-center gap-1 text-sm text-slate-600">
        <span className="mr-2 text-xs text-slate-500">匹配评分</span>
        {[0, 1, 2, 3, 4].map((item) => (
          <Star
            className={cn("h-4 w-4", item < 4 ? "fill-amber-400 text-amber-400" : "text-amber-400")}
            key={item}
          />
        ))}
        <span className="ml-2 font-medium">4.6/5</span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <BadgeCheck className="h-4 w-4" />
          证据摘要
        </div>
        {reasons.slice(0, 4).map((reason) => (
          <div className="flex gap-2 text-xs leading-5 text-slate-600" key={reason}>
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>{reason}</span>
          </div>
        ))}
        {evidence[0]?.snippet ? (
          <div className="text-xs leading-5 text-slate-500">{evidence[0].snippet}</div>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
          <FileText className="h-4 w-4" />
          生成开发信
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/companies/${company.id}`}>
            <Eye className="h-4 w-4" />
            查看详情
          </Link>
        </Button>
        <Button size="sm" variant="outline">
          <Send className="h-4 w-4" />
          发送邮件
        </Button>
      </div>
      {draft ? <div className="mt-3 text-xs text-slate-500">已关联草稿：{draft.subject}</div> : null}
    </div>
  );
}

function InsightLine({
  icon: Icon,
  label,
  link,
  value
}: {
  icon: typeof Globe2;
  label: string;
  link?: boolean;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className={cn("min-w-0 truncate", link && "text-blue-600")}>
        {value}
        {link && value !== "-" ? <ExternalLink className="ml-1 inline h-3.5 w-3.5" /> : null}
      </div>
    </div>
  );
}

function EmailPreview({ draft }: { draft?: EmailDraft }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold">邮件草稿预览</h2>
        <Circle className="h-4 w-4 text-slate-300" />
      </div>
      {draft ? (
        <div className="space-y-4 p-5">
          <div>
            <div className="text-xs text-slate-500">主题</div>
            <div className="mt-1 text-sm font-semibold">{draft.subject}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">邮件正文（节选）</div>
            <pre className="mt-2 max-h-[330px] whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {draft.body}
            </pre>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" variant="outline">
              <Save className="h-4 w-4" />
              保存草稿
            </Button>
            <Button size="sm" variant="outline">
              <Users className="h-4 w-4" />
              人工审核
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
              <Send className="h-4 w-4" />
              发送测试邮件
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-8 text-sm text-slate-500">暂无草稿。任务通过邮件审核节点后会显示在这里。</div>
      )}
    </div>
  );
}
