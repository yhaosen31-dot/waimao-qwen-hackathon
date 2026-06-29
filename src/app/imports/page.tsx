import Link from "next/link";
import { FileSpreadsheet, Mail, PlusCircle, Star, Users, Wand2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getImportJobResults, listImportJobs } from "@/repositories/store";
import { formatDateTime } from "@/lib/utils";
import type { Company, ImportJobStatus } from "@/types";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const importJobs = await listImportJobs();
  const jobResults = await Promise.all(
    importJobs.slice(0, 100).map(async (job) => ({
      job,
      results: await getImportJobResults(job.id)
    }))
  );
  const totalCompanies = jobResults.reduce(
    (sum, item) => sum + (item.results?.companies.length ?? 0),
    0
  );
  const totalCompleted = jobResults.reduce(
    (sum, item) =>
      sum + (item.results?.companies.filter((company) => company.enrichmentStatus === "completed").length ?? 0),
    0
  );
  const totalScored = jobResults.reduce(
    (sum, item) => sum + (item.results?.companies.filter((company) => Boolean(company.buyerFitTier)).length ?? 0),
    0
  );
  const totalDrafted = jobResults.reduce(
    (sum, item) => sum + (item.results?.companies.filter((company) => (company.emailDraftIds?.length ?? 0) > 0).length ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Excel 导入任务</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            这里可以找回已经上传过的 Excel 批次，并继续补全联系方式、Buyer Fit 评分和开发信草稿。
          </p>
        </div>
        <Button asChild>
          <Link href="/imports/new">
            <PlusCircle className="h-4 w-4" />
            新建导入
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={FileSpreadsheet} label="导入批次" value={importJobs.length} />
        <StatCard icon={Users} label="已入库客户" value={totalCompanies} />
        <StatCard icon={Wand2} label="补全完成" value={totalCompleted} />
        <StatCard icon={Star} label="已评分" value={totalScored} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>历史导入批次</CardTitle>
          <CardDescription>
            如果离开了导入页面，从这里打开对应批次，继续执行后续操作。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobResults.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              暂无导入任务。点击右上角“新建导入”上传 Excel 或 CSV。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>文件名</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>总行数</TableHead>
                    <TableHead>客户数</TableHead>
                    <TableHead>补全</TableHead>
                    <TableHead>评分</TableHead>
                    <TableHead>草稿</TableHead>
                    <TableHead>失败</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobResults.map(({ job, results }) => {
                    const companies = results?.companies ?? [];
                    const summary = summarizeCompanies(companies);

                    return (
                      <TableRow key={job.id}>
                        <TableCell className="min-w-[240px] font-medium">
                          <Link className="text-primary" href={`/imports/${job.id}`}>
                            {job.fileName}
                          </Link>
                          <div className="mt-1 text-xs text-muted-foreground">{job.id}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(job.status)}>{statusLabel(job.status)}</Badge>
                        </TableCell>
                        <TableCell>{job.totalRows}</TableCell>
                        <TableCell>{companies.length}</TableCell>
                        <TableCell>
                          {summary.enriched}/{companies.length}
                        </TableCell>
                        <TableCell>
                          {summary.scored}/{companies.length}
                        </TableCell>
                        <TableCell>{summary.drafted}</TableCell>
                        <TableCell>
                          {summary.failed > 0 ? (
                            <Badge variant="warning">{summary.failed}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="min-w-[150px]">{formatDateTime(job.updatedAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button asChild size="sm">
                              <Link href={`/imports/${job.id}`}>继续处理</Link>
                            </Button>
                            {job.runId ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/runs/${job.runId}`}>任务进度</Link>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalDrafted > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>下一步提醒</CardTitle>
            <CardDescription>
              已生成的开发信会进入人工审核，不会自动发送。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/reviews">
                <Mail className="h-4 w-4" />
                打开人工审核
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function summarizeCompanies(companies: Company[]) {
  return {
    enriched: companies.filter((company) =>
      company.enrichmentStatus === "completed" || company.enrichmentStatus === "needs_review"
    ).length,
    scored: companies.filter((company) => Boolean(company.buyerFitTier)).length,
    drafted: companies.filter((company) => (company.emailDraftIds?.length ?? 0) > 0).length,
    failed: companies.filter((company) => company.enrichmentStatus === "failed").length
  };
}

function statusLabel(status: ImportJobStatus) {
  const labels: Record<ImportJobStatus, string> = {
    uploaded: "已上传",
    parsed: "已解析",
    mapped: "已映射",
    imported: "已确认导入",
    failed: "失败"
  };
  return labels[status];
}

function statusVariant(status: ImportJobStatus) {
  if (status === "imported") return "success";
  if (status === "failed") return "warning";
  return "outline";
}
