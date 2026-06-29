import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Rows3, Users } from "lucide-react";
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
            <Link href="/imports/new">
              <ArrowLeft className="h-4 w-4" />
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
          <CardTitle>字段映射</CardTitle>
          <CardDescription>自动识别结果可手动调整，保存后会重新计算清洗和去重统计。</CardDescription>
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
