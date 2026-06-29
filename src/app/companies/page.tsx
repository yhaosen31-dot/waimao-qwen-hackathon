import Link from "next/link";
import { Download, Mail, MessageCircle, Search, Upload, Users } from "lucide-react";
import { ScorePill } from "@/components/score-pill";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  buyerFitLabels,
  companyRoleLabels,
  companyStatusLabels,
  emailStatusLabels,
  labelValue,
  sourceLabels,
  suggestedActionLabels,
  toLabelOptions
} from "@/lib/crm-labels";
import {
  crmBuyerFitTiers,
  crmCompanyRoles,
  crmCompanyStatuses,
  crmEmailStatuses,
  crmEnrichmentStatuses,
  crmSources,
  crmSuggestedActions,
  getFilteredCrmCompanies,
  getLeadScore,
  hydrateCrmCompanies,
  type CompanyCrmFilters
} from "@/services/companyCrmService";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: Promise<CompanyCrmFilters>;
}

export default async function CompaniesPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const { companies, db } = await getFilteredCrmCompanies(params);
  const pageSize = clampPageSize(params.pageSize);
  const page = clampPage(params.page, Math.max(1, Math.ceil(companies.length / pageSize)));
  const pagedCompanies = companies.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(companies.length / pageSize));
  const allCompanies = hydrateCrmCompanies(db);
  const countries = Array.from(
    new Set(allCompanies.map((company) => company.country).filter((country): country is string => Boolean(country)))
  ).sort();
  const exportHref = `/api/companies/export${buildQuery(params)}`;
  const averageScore =
    companies.length > 0
      ? Math.round(companies.reduce((sum, company) => sum + getLeadScore(company), 0) / companies.length)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">客户列表 / CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            长期管理 Excel 导入和产品搜索获得的客户，不会自动群发邮件。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/imports/new">
              <Upload className="h-4 w-4" />
              Excel 导入
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href={exportHref}>
              <Download className="h-4 w-4" />
              导出 CSV
            </a>
          </Button>
          <Button asChild>
            <Link href="/runs/new">创建获客任务</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Users} label="当前结果" value={companies.length} />
        <StatCard icon={Mail} label="邮箱总数" value={db.emailAddresses.length} />
        <StatCard icon={MessageCircle} label="平均分" value={averageScore} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>筛选客户</CardTitle>
          <CardDescription>
            支持按来源、国家、补全状态、Buyer Fit、联系方式、邮件状态、客户状态和分数范围筛选。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/companies" className="grid gap-3 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="q">
                搜索
              </label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  defaultValue={params.q ?? ""}
                  id="q"
                  name="q"
                  placeholder="公司名、国家、域名、邮箱、WhatsApp、产品描述"
                />
                <Button size="icon" type="submit">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <FilterSelect label="来源" name="source" options={toLabelOptions(crmSources, sourceLabels)} value={params.source} />
            <FilterSelect label="国家" name="country" options={countries} value={params.country} />
            <FilterSelect
              label="补全状态"
              name="enrichmentStatus"
              options={crmEnrichmentStatuses}
              value={params.enrichmentStatus}
            />
            <FilterSelect
              label="客户匹配度"
              name="buyerFit"
              options={toLabelOptions([...crmBuyerFitTiers], buyerFitLabels)}
              value={params.buyerFit}
            />
            <FilterSelect
              label="客户角色"
              name="companyRole"
              options={toLabelOptions(crmCompanyRoles, companyRoleLabels)}
              value={params.companyRole}
            />
            <FilterSelect
              label="建议动作"
              name="suggestedAction"
              options={toLabelOptions(crmSuggestedActions, suggestedActionLabels)}
              value={params.suggestedAction}
            />
            <FilterSelect
              label="官网"
              name="hasWebsite"
              options={[
                { label: "有官网", value: "true" },
                { label: "无官网", value: "false" }
              ]}
              value={params.hasWebsite}
            />
            <FilterSelect
              label="邮箱"
              name="hasEmail"
              options={[
                { label: "有邮箱", value: "true" },
                { label: "无邮箱", value: "false" }
              ]}
              value={params.hasEmail}
            />
            <FilterSelect
              label="WhatsApp"
              name="hasWhatsapp"
              options={[
                { label: "有 WhatsApp", value: "true" },
                { label: "无 WhatsApp", value: "false" }
              ]}
              value={params.hasWhatsapp}
            />
            <FilterSelect
              label="邮件状态"
              name="emailStatus"
              options={toLabelOptions(crmEmailStatuses, emailStatusLabels)}
              value={params.emailStatus}
            />
            <FilterSelect
              label="客户状态"
              name="status"
              options={toLabelOptions(crmCompanyStatuses, companyStatusLabels)}
              value={params.status}
            />
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="leadScoreMin">
                线索分最小
              </label>
              <Input
                defaultValue={params.leadScoreMin ?? ""}
                id="leadScoreMin"
                min="0"
                name="leadScoreMin"
                placeholder="0"
                type="number"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="leadScoreMax">
                线索分最大
              </label>
              <Input
                defaultValue={params.leadScoreMax ?? ""}
                id="leadScoreMax"
                max="100"
                name="leadScoreMax"
                placeholder="100"
                type="number"
              />
            </div>
            <div className="flex items-end gap-2 lg:col-span-2">
              <Button type="submit">应用筛选</Button>
              <Button asChild type="button" variant="outline">
                <Link href="/companies">清空</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>客户列表</CardTitle>
          <CardDescription>导出 CSV 会使用当前筛选结果。</CardDescription>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              暂无客户。可以先上传 Excel / CSV，或从产品名称搜索获客。
            </div>
          ) : (
            <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <div>
                显示 {companies.length === 0 ? 0 : (page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, companies.length)} / {companies.length}
              </div>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={buildPageHref(params, Math.max(1, page - 1), pageSize)}>上一页</Link>
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link href={buildPageHref(params, Math.min(totalPages, page + 1), pageSize)}>下一页</Link>
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>公司名</TableHead>
                    <TableHead>国家</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>官网</TableHead>
                    <TableHead>推荐邮箱</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>客户匹配度</TableHead>
                    <TableHead>客户角色</TableHead>
                    <TableHead>线索分</TableHead>
                    <TableHead>置信度</TableHead>
                    <TableHead>建议动作</TableHead>
                    <TableHead>补全状态</TableHead>
                    <TableHead>邮件状态</TableHead>
                    <TableHead>客户状态</TableHead>
                    <TableHead>证据数</TableHead>
                    <TableHead>最后更新</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="min-w-[220px]">
                        <Link className="font-medium text-primary" href={`/companies/${company.id}`}>
                          {company.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{company.domain ?? "-"}</div>
                        {company.sourceQuery ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            query: {company.sourceQuery}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{company.country ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={company.source === "excel_import" ? "success" : "outline"}>
                          {labelValue(company.source, sourceLabels)}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        {company.primaryWebsite ?? company.website ? (
                          <a
                            className="text-primary"
                            href={company.primaryWebsite ?? company.website}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {company.domain ?? company.primaryWebsite ?? company.website}
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{company.primaryEmail ?? "-"}</TableCell>
                      <TableCell>{company.primaryWhatsapp ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ScorePill score={getLeadScore(company)} />
                          <Badge variant="outline">{labelValue(company.buyerFitTier ?? "unknown", buyerFitLabels)}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>{labelValue(company.companyRole, companyRoleLabels)}</TableCell>
                      <TableCell>{getLeadScore(company)}</TableCell>
                      <TableCell>{Math.round((company.confidence ?? 0) * 100)}%</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            company.suggestedAction === "manual_review" ? "warning" : "outline"
                          }
                        >
                          {labelValue(company.suggestedAction, suggestedActionLabels)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.enrichmentStatus === "completed" ? "success" : "outline"}>
                          {company.enrichmentStatus ?? "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.emailStatus === "approved" ? "success" : "outline"}>
                          {labelValue(company.emailStatus, emailStatusLabels)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.status === "blacklist" ? "warning" : "outline"}>
                          {labelValue(company.status ?? "new", companyStatusLabels)}
                        </Badge>
                      </TableCell>
                      <TableCell>{company.evidenceCount}</TableCell>
                      <TableCell className="min-w-[160px]">{formatDateTime(company.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  name,
  options,
  value
}: {
  label: string;
  name: string;
  options: Array<string | { label: string; value: string }>;
  value?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground" htmlFor={name}>
        {label}
      </label>
      <select
        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        defaultValue={value ?? ""}
        id={name}
        name={name}
      >
        <option value="">全部</option>
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function buildQuery(params: CompanyCrmFilters) {
  const entries = Object.entries(params).filter((entry): entry is [string, string] =>
    Boolean(entry[1]) && entry[0] !== "page" && entry[0] !== "pageSize"
  );
  const query = new URLSearchParams(entries).toString();
  return query ? `?${query}` : "";
}

function buildPageHref(params: CompanyCrmFilters, page: number, pageSize: number) {
  const entries = Object.entries(params).filter((entry): entry is [string, string] =>
    Boolean(entry[1]) && entry[0] !== "page"
  );
  const query = new URLSearchParams(entries);
  query.set("page", String(page));
  query.set("pageSize", String(pageSize));
  return `/companies?${query.toString()}`;
}

function clampPage(value: string | undefined, totalPages: number) {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(totalPages, Math.max(1, Math.trunc(parsed)));
}

function clampPageSize(value: string | undefined) {
  const parsed = Number(value ?? "50");
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(20, Math.trunc(parsed)));
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
