import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileSpreadsheet, Rows3, Users } from "lucide-react";
import { ImportMappingForm } from "@/components/import-mapping-form";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getImportJobResults } from "@/repositories/store";
import { getBuyerFitSummary } from "@/services/buyerFitScoringService";
import { extractHeadersFromRows } from "@/services/excelImportService";
import { formatDateTime } from "@/lib/utils";
import type { Company } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{
    id: string;
  }>;
}

export default async function ImportDetailPage({ params }: Props) {
  const { id } = await params;
  const results = await getImportJobResults(id);

  if (!results) notFound();

  const { importJob, rows, mapping, companies } = results;
  const enrichmentSummary = getEnrichmentSummary(companies);
  const headers = extractHeadersFromRows(rows);
  const previewRows = rows.slice(0, 20);
  const buyerFitSummary = getBuyerFitSummary(companies);
  const failedCompanies = companies.filter((company) => company.enrichmentStatus === "failed");
  const pendingEnrichmentCompanies = companies.filter((company) =>
    !company.enrichmentStatus || company.enrichmentStatus === "pending"
  );
  const unscoredCompanies = companies.filter((company) => !company.buyerFitTier);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">导入任务详情</h1>
            <Badge variant={importJob.status === "imported" ? "success" : "outline"}>
              {importJob.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {importJob.fileName} / {formatDateTime(importJob.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/imports">
              <ArrowLeft className="h-4 w-4" />
              导入任务列表
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/imports/new">
              新建导入
            </Link>
          </Button>
          <Button asChild>
            <Link href="/companies">查看客户列表</Link>
          </Button>
        </div>
      </div>

      {importJob.errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {importJob.errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Rows3} label="总行数" value={importJob.totalRows} />
        <StatCard icon={Users} label="识别公司" value={importJob.companyCount} />
        <StatCard icon={Users} label="去重后公司" value={importJob.dedupedCompanyCount} />
        <StatCard icon={Rows3} label="缺少公司名" value={importJob.missingCompanyNameCount} />
        <StatCard icon={FileSpreadsheet} label="已入库候选" value={companies.length} />
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="补全完成" value={enrichmentSummary?.completed ?? 0} />
        <StatCard icon={Users} label="补全失败" value={enrichmentSummary?.failed ?? 0} />
        <StatCard icon={Users} label="需人工确认" value={enrichmentSummary?.needsReview ?? 0} />
        <StatCard icon={FileSpreadsheet} label="找到官网" value={enrichmentSummary?.websiteFound ?? 0} />
        <StatCard icon={FileSpreadsheet} label="未找到官网" value={enrichmentSummary?.websiteNotFound ?? 0} />
        <StatCard icon={Rows3} label="运行中" value={enrichmentSummary?.running ?? 0} />
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="已评分" value={buyerFitSummary.scored} />
        <StatCard icon={Users} label="High" value={buyerFitSummary.high} />
        <StatCard icon={Users} label="Medium" value={buyerFitSummary.medium} />
        <StatCard icon={Users} label="Low" value={buyerFitSummary.low} />
        <StatCard icon={Users} label="Unknown" value={buyerFitSummary.unknown} />
        <StatCard icon={Users} label="Manual review" value={buyerFitSummary.manualReview} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>字段映射与后续操作</CardTitle>
          <CardDescription>
            先确认导入；确认后可以随时回到本页继续补全官网和联系方式、Buyer Fit 评分、生成开发信草稿。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportMappingForm
            headers={headers}
            importJobId={importJob.id}
            importedCount={companies.length}
            mapping={mapping}
            status={importJob.status}
          />
        </CardContent>
      </Card>

      {failedCompanies.length > 0 || pendingEnrichmentCompanies.length > 0 || unscoredCompanies.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>待处理与失败明细</CardTitle>
            <CardDescription>
              如果任务中途离开页面，从左侧“Excel 导入”打开本批次，然后用上方按钮继续处理或重试。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <StatusHint
                count={pendingEnrichmentCompanies.length}
                label="未补全联系方式"
                message="点击上方“开始补全官网和联系方式”。"
              />
              <StatusHint
                count={unscoredCompanies.length}
                label="未做 Buyer Fit 评分"
                message="补全后点击上方“开始 Buyer Fit 评分”。"
              />
              <StatusHint
                count={failedCompanies.length}
                label="补全失败"
                message="点击上方“只重试失败客户”。"
              />
            </div>

            {failedCompanies.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  失败客户原因
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>公司</TableHead>
                        <TableHead>国家</TableHead>
                        <TableHead>失败原因</TableHead>
                        <TableHead>最后更新时间</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failedCompanies.slice(0, 30).map((company) => (
                        <TableRow key={company.id}>
                          <TableCell className="min-w-[220px] font-medium">
                            <Link className="text-primary" href={`/companies/${company.id}`}>
                              {company.name}
                            </Link>
                          </TableCell>
                          <TableCell>{company.country ?? "-"}</TableCell>
                          <TableCell className="min-w-[300px]">
                            {latestFailedLogMessage(company) ?? "补全过程失败，建议重试或人工查看证据。"}
                          </TableCell>
                          <TableCell>{formatDateTime(company.updatedAt)}</TableCell>
                          <TableCell>
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/companies/${company.id}`}>查看客户</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {failedCompanies.length > 30 ? (
                  <p className="text-xs text-muted-foreground">
                    这里只显示前 30 个失败客户，更多客户可在客户列表按“补全状态=failed”筛选。
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>前 20 行预览</CardTitle>
          <CardDescription>预览显示原始列、清洗后的公司名和当前行状态。</CardDescription>
        </CardHeader>
        <CardContent>
          {previewRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              暂无可预览行。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>行号</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>公司名</TableHead>
                    <TableHead>国家</TableHead>
                    <TableHead>产品描述</TableHead>
                    <TableHead>交易记录</TableHead>
                    {headers.map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.rowIndex}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "ready" ? "success" : "outline"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[180px] font-medium">
                        {row.companyName || "-"}
                        {row.normalizedCompanyName ? (
                          <div className="text-xs text-muted-foreground">
                            {row.normalizedCompanyName}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.country || "-"}</TableCell>
                      <TableCell className="min-w-[220px]">{row.productDescription || "-"}</TableCell>
                      <TableCell className="min-w-[220px]">{row.transactionSummary || "-"}</TableCell>
                      {headers.map((header) => (
                        <TableCell className="min-w-[160px]" key={`${row.id}-${header}`}>
                          {row.rawData[header] || "-"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getEnrichmentSummary(companies: Company[]) {
  return {
    total: companies.length,
    completed: companies.filter((company) => company.enrichmentStatus === "completed").length,
    failed: companies.filter((company) => company.enrichmentStatus === "failed").length,
    running: companies.filter((company) => company.enrichmentStatus === "running").length,
    needsReview: companies.filter((company) => company.enrichmentStatus === "needs_review").length,
    websiteFound: companies.filter((company) => company.websiteStatus === "found").length,
    websiteNotFound: companies.filter((company) => company.websiteStatus === "not_found").length
  };
}

function StatusHint({
  count,
  label,
  message
}: {
  count: number;
  label: string;
  message: string;
}) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <div className="text-2xl font-semibold">{count}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{message}</div>
    </div>
  );
}

function latestFailedLogMessage(company: Company) {
  return [...(company.enrichmentLogs ?? [])]
    .reverse()
    .find((log) => log.status === "failed")?.message;
}
