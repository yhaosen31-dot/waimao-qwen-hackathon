import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet, Globe2, Mail, MessageCircle, Phone, UserRound } from "lucide-react";
import { CompanyNoteForm } from "@/components/company-note-form";
import { CompanyStatusForm } from "@/components/company-status-form";
import { EmailDraftActionPanel } from "@/components/email-draft-action-panel";
import { ForceEmailDraftButton } from "@/components/force-email-draft-button";
import { ScorePill } from "@/components/score-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buyerFitLabels,
  companyRoleLabels,
  companyStatusLabels,
  emailStatusLabels,
  evidenceTypeLabels,
  labelValue,
  sourceLabels,
  suggestedActionLabels
} from "@/lib/crm-labels";
import { getCompanyResults } from "@/repositories/store";

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

  const {
    company,
    contacts,
    emailAddresses,
    whatsappNumbers,
    phoneNumbers,
    evidence,
    emailDrafts,
    companyNotes,
    emailLogs
  } = results;
  const primaryContact = contacts[0];
  const buyerFitEvidence = evidence.filter((item) => item.type === "buyer_fit");
  const excelEvidence = evidence.filter((item) => item.type === "excel_import");
  const hasActiveEmailDraft = emailDrafts.some((draft) => draft.status !== "skipped");
  const hasAnyEmail = Boolean(company.recommendedEmails?.length || emailAddresses.length);
  const forceDraftDisabledReason =
    company.status === "blacklist"
      ? "黑名单客户不能生成草稿。"
      : !hasAnyEmail
        ? "没有邮箱，不能生成草稿。"
        : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{company.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {company.country ?? "-"} / {company.domain ?? "-"} / 最后更新{" "}
            {formatDateTime(company.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={company.status === "blacklist" ? "warning" : "outline"}>
            {labelValue(company.status ?? "new", companyStatusLabels)}
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
              <CardTitle>客户状态</CardTitle>
              <CardDescription>
                手动修改状态会更新最后更新时间。黑名单客户不会再生成邮件草稿。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoItem label="当前状态" value={labelValue(company.status ?? "new", companyStatusLabels)} />
              <InfoItem label="最近更新时间" value={formatDateTime(company.updatedAt)} />
              <CompanyStatusForm companyId={company.id} status={company.status ?? "new"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>基础信息</CardTitle>
              <CardDescription>{company.importerProfile ?? "CRM 客户资料"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoItem label="公司名" value={company.name} />
              <InfoItem label="国家" value={company.country ?? "-"} />
              <InfoItem label="来源" value={labelValue(company.source, sourceLabels)} />
              <InfoItem label="域名" value={company.domain ?? "-"} />
              <InfoItem label="产品描述" value={company.productDescription ?? company.products.join(", ") ?? "-"} />
              <InfoItem label="交易记录摘要" value={company.transactionSummary ?? "-"} />
              <InfoItem label="来源关键词" value={company.sourceKeyword ?? "-"} />
              <InfoItem label="来源 Query" value={company.sourceQuery ?? company.sourceKeyword ?? "-"} />
              <InfoItem label="来源 Provider" value={company.sourceProvider ?? "-"} />
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">官网</div>
                {company.primaryWebsite ?? company.website ? (
                  <a
                    className="mt-1 flex items-center gap-2 text-primary"
                    href={company.primaryWebsite ?? company.website}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Globe2 className="h-4 w-4" />
                    {company.primaryWebsite ?? company.website}
                  </a>
                ) : (
                  <p className="mt-1 text-muted-foreground">-</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>推荐联系方式</CardTitle>
              <CardDescription>
                Enrichment 状态：{company.enrichmentStatus ?? "pending"} / 可信度：
                {formatConfidence(company.contactConfidence)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ContactLine
                icon={<UserRound className="h-4 w-4 text-muted-foreground" />}
                value={
                  primaryContact
                    ? `${primaryContact.fullName}${primaryContact.title ? `, ${primaryContact.title}` : ""}`
                    : "No contact"
                }
              />
              <ContactLine
                icon={<Mail className="h-4 w-4 text-muted-foreground" />}
                value={company.recommendedEmails?.join(", ") || emailAddresses[0]?.email || "-"}
              />
              <ContactLine
                icon={<Phone className="h-4 w-4 text-muted-foreground" />}
                value={company.recommendedPhone ?? phoneNumbers[0]?.number ?? "-"}
              />
              <ContactLine
                icon={<MessageCircle className="h-4 w-4 text-muted-foreground" />}
                value={company.recommendedWhatsapp ?? whatsappNumbers[0]?.number ?? "-"}
              />
              <InfoItem label="LinkedIn" value={company.recommendedSocialLinks?.linkedin ?? "-"} />
              <InfoItem label="Facebook" value={company.recommendedSocialLinks?.facebook ?? "-"} />
              <InfoItem label="证据摘要" value={company.evidenceSummary ?? "-"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>客户匹配度</CardTitle>
              <CardDescription>MiniMax 只基于证据做评分。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <ScorePill score={company.leadScore ?? company.buyerFitScore ?? 0} />
                <Badge variant="outline">{labelValue(company.buyerFitTier ?? "unknown", buyerFitLabels)}</Badge>
              </div>
              <div className="grid gap-3 text-sm">
                <InfoItem label="客户角色" value={labelValue(company.companyRole, companyRoleLabels)} />
                <InfoItem label="线索分" value={String(company.leadScore ?? company.buyerFitScore ?? 0)} />
                <InfoItem label="置信度" value={formatConfidence(company.confidence)} />
                <InfoItem label="建议动作" value={labelValue(company.suggestedAction, suggestedActionLabels)} />
              </div>
              <BulletList label="评分理由" values={company.buyerFitReasons} />
              <BulletList label="风险提示" values={company.buyerFitRisks ?? []} />
              <EvidenceSummaryList
                emptyText="暂无客户匹配评分证据。"
                evidence={buyerFitEvidence}
                title="使用的客户匹配评分证据"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {company.source === "excel_import" ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                  Excel 导入信息
                </CardTitle>
                <CardDescription>来源：uploaded_excel / importJobId：{company.importJobId ?? "-"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoItem label="原始产品描述" value={company.productDescription ?? "-"} />
                <InfoItem label="交易记录摘要" value={company.transactionSummary ?? "-"} />
                {company.importJobId ? (
                  <Button asChild variant="outline">
                    <Link href={`/imports/${company.importJobId}`}>打开导入任务</Link>
                  </Button>
                ) : null}
                <EvidenceSummaryList
                  emptyText="暂无 Excel 证据。"
                  evidence={excelEvidence}
                  title="Excel 原始行证据"
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>邮件草稿</CardTitle>
              <CardDescription>这里只能审核草稿，本阶段不会真实发送邮件。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasActiveEmailDraft ? (
                <div className="flex flex-col gap-3 rounded-md border border-dashed p-4 text-sm md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">该客户未自动生成开发信草稿</div>
                    <div className="mt-1 text-muted-foreground">
                      通常是因为客户匹配度较低、建议跳过或证据不足。手动生成后仍会进入人工审核，不会自动发送。
                    </div>
                  </div>
                  <ForceEmailDraftButton companyId={company.id} disabledReason={forceDraftDisabledReason} />
                </div>
              ) : null}
              {emailDrafts.length > 0 ? (
                emailDrafts.map((draft) => (
                  <div className="space-y-3 rounded-md border p-3" key={draft.id}>
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <InfoItem label="收件人" value={draft.toEmail ?? "-"} />
                      <InfoItem label="状态" value={labelValue(draft.status, emailStatusLabels)} />
                      <InfoItem label="Provider" value={draft.provider} />
                      <InfoItem label="主题" value={draft.subject} />
                      <InfoItem label="创建时间" value={formatDateTime(draft.createdAt)} />
                      <InfoItem label="发送时间" value={formatDateTime(draft.sentAt)} />
                      <InfoItem label="失败原因" value={draft.errorMessage ?? "-"} />
                    </div>
                    <div className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
                      {draft.body}
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase text-muted-foreground">
                        使用的证据
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {(draft.usedEvidenceIds ?? draft.evidenceIds).map((evidenceId) => {
                          const item = evidence.find((entry) => entry.id === evidenceId);
                          return (
                            <div className="rounded-md border p-2 text-xs text-muted-foreground" key={evidenceId}>
                              {item
                                ? `${item.type}: ${item.rawText ?? item.snippet ?? item.title ?? evidenceId}`
                                : evidenceId}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <EmailDraftActionPanel draft={draft} />
                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase text-muted-foreground">发送记录</div>
                      {emailLogs.filter((log) => log.emailDraftId === draft.id).length > 0 ? (
                        emailLogs
                          .filter((log) => log.emailDraftId === draft.id)
                          .map((log) => (
                            <div className="rounded-md border p-2 text-xs text-muted-foreground" key={log.id}>
                              <div>
                                {log.status} / {log.provider} / {formatDateTime(log.createdAt)}
                              </div>
                              <div>to: {log.toEmail ?? "-"}</div>
                              {log.providerMessageId ? <div>message id: {log.providerMessageId}</div> : null}
                              {log.errorMessage ? <div className="text-destructive">{log.errorMessage}</div> : null}
                            </div>
                          ))
                      ) : (
                        <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                          暂无发送记录。
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                  暂无邮件草稿。
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>跟进备注</CardTitle>
              <CardDescription>备注按时间倒序显示。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CompanyNoteForm companyId={company.id} />
              <div className="space-y-3">
                {companyNotes.length > 0 ? (
                  companyNotes.map((note) => (
                    <div className="rounded-md border p-3 text-sm" key={note.id}>
                      <div className="whitespace-pre-wrap">{note.content}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {formatDateTime(note.createdAt)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                    暂无备注。
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>补全日志</CardTitle>
              <CardDescription>官网、联系方式和证据融合的执行记录。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {company.enrichmentLogs?.length ? (
                company.enrichmentLogs.map((item, index) => (
                  <div className="rounded-md border p-3" key={`${item.timestamp}-${index}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{item.step}</div>
                      <Badge variant={item.status === "completed" ? "success" : "outline"}>
                        {item.status}
                      </Badge>
                    </div>
                    <div className="mt-2 text-muted-foreground">{item.message}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(item.timestamp)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed p-5 text-muted-foreground">
                  暂无 enrichment 日志。
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>证据列表</CardTitle>
              <CardDescription>每条官网、邮箱、电话、WhatsApp、社媒和评分结果都保留来源。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {evidence.length > 0 ? (
                evidence.map((item) => (
                  <div className="rounded-md border p-3 text-sm" key={item.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{item.title ?? labelValue(item.type, evidenceTypeLabels)}</div>
                      <Badge variant="outline">{labelValue(item.type, evidenceTypeLabels)}</Badge>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                      <div>来源：{labelValue(item.sourceProvider ?? item.provider ?? item.source, sourceLabels)}</div>
                      <div>置信度：{formatConfidence(item.confidence)}</div>
                      <div>创建时间：{formatDateTime(item.createdAt)}</div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-muted-foreground">
                      {item.rawText ?? item.snippet ?? "无证据文本"}
                    </div>
                    {item.url ? (
                      <a
                        className="mt-2 block break-all text-xs text-primary"
                        href={item.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {item.url}
                      </a>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                  暂无证据。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words">{value}</div>
    </div>
  );
}

function ContactLine({ icon, value }: { icon: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon}
      <div className="break-words">{value}</div>
    </div>
  );
}

function BulletList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      {values.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          {values.map((value) => (
            <li key={value}>- {value}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">-</p>
      )}
    </div>
  );
}

function EvidenceSummaryList({
  title,
  evidence,
  emptyText
}: {
  title: string;
  evidence: Array<{ id: string; rawText?: string; snippet?: string; title?: string }>;
  emptyText: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{title}</div>
      <div className="mt-2 space-y-2">
        {evidence.length > 0 ? (
          evidence.map((item) => (
            <div className="rounded-md border p-3 text-sm text-muted-foreground" key={item.id}>
              {item.rawText ?? item.snippet ?? item.title ?? "无证据文本"}
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function formatConfidence(value?: number) {
  if (value === undefined) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
