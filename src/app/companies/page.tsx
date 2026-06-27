import Link from "next/link";
import { Mail, MessageCircle, Users } from "lucide-react";
import { ScorePill } from "@/components/score-pill";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCompanies, readStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const filters = [
  { label: "全部", value: "" },
  { label: "高匹配客户", value: "high_fit" },
  { label: "中匹配客户", value: "medium_fit" },
  { label: "低匹配客户", value: "low_fit" },
  { label: "邮件已批准", value: "email_approved" },
  { label: "邮件已跳过", value: "email_skipped" },
  { label: "已保存 CRM", value: "saved_to_crm" }
];

interface Props {
  searchParams?: Promise<{
    filter?: string;
  }>;
}

export default async function CompaniesPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const activeFilter = params.filter ?? "";
  const [allCompanies, db] = await Promise.all([listCompanies(), readStore()]);
  const companies = allCompanies.filter((company) => {
    const score = company.buyerFitScore ?? 0;
    const draft = db.emailDrafts.find((item) => item.companyId === company.id);
    if (activeFilter === "high_fit") return score >= 85;
    if (activeFilter === "medium_fit") return score >= 70 && score < 85;
    if (activeFilter === "low_fit") return score < 70;
    if (activeFilter === "email_approved") return draft?.status === "approved";
    if (activeFilter === "email_skipped") return draft?.status === "skipped";
    if (activeFilter === "saved_to_crm") return company.status === "saved_to_crm";
    return true;
  });
  const averageScore =
    companies.length > 0
      ? Math.round(
          companies.reduce((sum, company) => sum + (company.buyerFitScore ?? 0), 0) /
            companies.length
        )
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">客户列表 / CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            从 LangGraph mock 流程沉淀的客户、触达渠道和邮件审核状态。
          </p>
        </div>
        <Button asChild>
          <Link href="/runs/new">创建获客任务</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Users} label="Companies" value={companies.length} />
        <StatCard icon={Mail} label="Emails" value={db.emailAddresses.length} />
        <StatCard icon={MessageCircle} label="Avg score" value={averageScore} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>按匹配度、邮件审核和 CRM 状态筛选客户。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <Link
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted",
                  activeFilter === filter.value && "border-blue-200 bg-blue-50 text-blue-700"
                )}
                href={filter.value ? `/companies?filter=${filter.value}` : "/companies"}
                key={filter.value}
              >
                {filter.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>客户列表</CardTitle>
          <CardDescription>按 Buyer Fit 评分排序。</CardDescription>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              暂无客户。请先创建任务并完成关键词审核。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>公司名</TableHead>
                  <TableHead>国家</TableHead>
                  <TableHead>官网</TableHead>
                  <TableHead>有官网</TableHead>
                  <TableHead>邮箱数量</TableHead>
                  <TableHead>WhatsApp 数量</TableHead>
                  <TableHead>有 WhatsApp</TableHead>
                  <TableHead>来源关键词</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>联系方式可信度</TableHead>
                  <TableHead>Buyer Fit</TableHead>
                  <TableHead>评分</TableHead>
                  <TableHead>邮件状态</TableHead>
                  <TableHead>客户状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => {
                  const emails = db.emailAddresses.filter((item) => item.companyId === company.id);
                  const whatsappNumbers = db.whatsappNumbers.filter(
                    (item) => item.companyId === company.id
                  );
                  const evidence = db.evidence.filter((item) => item.companyId === company.id);
                  const contactEvidence = evidence.filter(
                    (item) => item.type === "contact_search" || item.type === "whatsapp_mock"
                  );
                  const contactConfidence =
                    contactEvidence.length > 0
                      ? Math.round(
                          (contactEvidence.reduce((sum, item) => sum + (item.confidence ?? 0), 0) /
                            contactEvidence.length) *
                            100
                        )
                      : 0;
                  const draft = db.emailDrafts.find((item) => item.companyId === company.id);

                  return (
                    <TableRow key={company.id}>
                      <TableCell>
                        <Link className="font-medium text-primary" href={`/companies/${company.id}`}>
                          {company.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{company.domain}</div>
                      </TableCell>
                      <TableCell>{company.country ?? "-"}</TableCell>
                      <TableCell>
                        {company.website ? (
                          <a className="text-primary" href={company.website} rel="noreferrer" target="_blank">
                            {company.domain ?? company.website}
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{company.website ? "Yes" : "No"}</TableCell>
                      <TableCell>{emails.length}</TableCell>
                      <TableCell>{whatsappNumbers.length}</TableCell>
                      <TableCell>{whatsappNumbers.length > 0 ? "Yes" : "No"}</TableCell>
                      <TableCell>{company.sourceKeyword ?? "-"}</TableCell>
                      <TableCell>{evidence.length}</TableCell>
                      <TableCell>{contactConfidence}%</TableCell>
                      <TableCell>
                        <ScorePill score={company.buyerFitScore ?? 0} />
                      </TableCell>
                      <TableCell>{company.leadScore ?? company.buyerFitScore ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={draft?.status === "approved" ? "success" : "outline"}>
                          {draft?.status ?? "none"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.status === "saved_to_crm" ? "success" : "outline"}>
                          {company.status ?? "new"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
