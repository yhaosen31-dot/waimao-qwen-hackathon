import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe2, Mail, MessageCircle, UserRound } from "lucide-react";
import { ScorePill } from "@/components/score-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompanyResults } from "@/lib/store";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{
    companyId: string;
  }>;
}

export default async function CompanyDetailPage({ params }: Params) {
  const { companyId } = await params;
  const results = await getCompanyResults(companyId);

  if (!results) notFound();

  const { company, contacts, emailAddresses, whatsappNumbers, evidence, emailDrafts } = results;
  const primaryContact = contacts[0];
  const draft = emailDrafts[0];
  const externalEvidence = evidence.filter((item) =>
    ["website_mock", "website_search", "contact_search", "whatsapp_mock"].includes(item.type)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{company.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {company.country ?? "-"} / {company.domain ?? "-"} / source keyword:{" "}
            {company.sourceKeyword ?? "-"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={company.status === "saved_to_crm" ? "success" : "outline"}>
            {company.status ?? "new"}
          </Badge>
          <Button asChild variant="outline">
            <Link href={`/runs/${company.runId}`}>打开任务</Link>
          </Button>
          <Button asChild>
            <Link href="/companies">返回客户列表</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Buyer Fit</CardTitle>
              <CardDescription>客户匹配度和评分理由。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <ScorePill score={company.buyerFitScore ?? 0} />
                <span className="text-sm text-muted-foreground">
                  Lead score {company.leadScore ?? company.buyerFitScore ?? 0} / confidence{" "}
                  {Math.round((company.confidence ?? 0) * 100)}%
                </span>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {company.buyerFitReasons.map((reason) => (
                  <li key={reason}>- {reason}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>联系方式</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-muted-foreground" />
                {primaryContact
                  ? `${primaryContact.fullName}, ${primaryContact.title}`
                  : "No contact"}
              </div>
              {emailAddresses.map((email) => (
                <div className="flex items-center gap-2" key={email.id}>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {email.email}
                </div>
              ))}
              {whatsappNumbers.map((whatsapp) => (
                <div className="flex items-center gap-2" key={whatsapp.id}>
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  {whatsapp.number}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>{company.importerProfile}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm md:grid-cols-2">
              <InfoItem label="国家" value={company.country ?? "-"} />
              <InfoItem label="域名" value={company.domain ?? "-"} />
              <InfoItem label="来源关键词" value={company.sourceKeyword ?? "-"} />
              <InfoItem label="客户状态" value={company.status ?? "new"} />
              <div className="md:col-span-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">官网</div>
                {company.website ? (
                  <a className="mt-1 flex items-center gap-2 text-primary" href={company.website} rel="noreferrer" target="_blank">
                    <Globe2 className="h-4 w-4" />
                    {company.website}
                  </a>
                ) : (
                  <p className="mt-1 text-muted-foreground">No website</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>外部调查证据</CardTitle>
              <CardDescription>
                官网、电话、WhatsApp、LinkedIn / Facebook 的搜索来源和可信度。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {externalEvidence.map((item) => (
                <div className="rounded-md border p-3 text-sm" key={item.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{item.title ?? item.type}</div>
                    <Badge variant="outline">{item.source ?? item.provider}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">type: {item.type}</div>
                  <div className="mt-2 text-muted-foreground">
                    {item.rawText ?? item.snippet ?? "No evidence text"}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    confidence {Math.round((item.confidence ?? 0) * 100)}%
                  </div>
                  {item.url ? (
                    <a className="mt-2 block text-xs text-primary" href={item.url} rel="noreferrer" target="_blank">
                      {item.url}
                    </a>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence 列表</CardTitle>
              <CardDescription>每个客户至少包含跨境搜、官网、邮箱、WhatsApp、评分和开发信依据。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {evidence.map((item) => (
                <div className="rounded-md border p-3 text-sm" key={item.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{item.title ?? item.type}</div>
                    <Badge variant="outline">{item.type}</Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">{item.rawText ?? item.snippet}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    confidence {Math.round((item.confidence ?? 0) * 100)}%
                  </div>
                  {item.url ? (
                    <a className="mt-2 block text-xs text-primary" href={item.url} rel="noreferrer" target="_blank">
                      {item.url}
                    </a>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>邮件草稿</CardTitle>
              <CardDescription>邮件审核状态：{draft?.status ?? "none"}。</CardDescription>
            </CardHeader>
            <CardContent>
              {draft ? (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/50 p-3 text-sm font-medium">
                    <span>{draft.subject}</span>
                    <Badge variant={draft.status === "approved" ? "success" : "outline"}>
                      {draft.status}
                    </Badge>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-4 text-sm leading-6">
                    {draft.body}
                  </pre>
                </>
              ) : (
                <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                  暂无邮件草稿。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
