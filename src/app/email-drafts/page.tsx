import Link from "next/link";
import { Edit3 } from "lucide-react";
import { EmailDraftActionPanel } from "@/components/email-draft-action-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buyerFitLabels, emailStatusLabels, labelValue } from "@/lib/crm-labels";
import { readCrmStore } from "@/repositories/store";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EmailDraftsPage() {
  const db = await readCrmStore();
  const drafts = [...db.emailDrafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">邮件草稿</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            所有邮件仍保存在本地 JSON，不真实发送。
          </p>
        </div>
        <Button asChild>
          <Link href="/runs/new">创建获客任务</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>草稿列表</CardTitle>
          <CardDescription>可从对应 run 进入编辑和审核。</CardDescription>
        </CardHeader>
        <CardContent>
          {drafts.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              暂无邮件草稿。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>公司名</TableHead>
                  <TableHead>收件人</TableHead>
                  <TableHead>主题</TableHead>
                  <TableHead>客户匹配度</TableHead>
                  <TableHead>线索分</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft) => {
                  const company = db.companies.find((item) => item.id === draft.companyId);
                  const toEmail =
                    draft.toEmail ??
                    db.emailAddresses.find((email) => email.id === draft.toEmailAddressId)?.email ??
                    db.emailAddresses.find((email) => email.companyId === draft.companyId)?.email ??
                    "-";

                  return (
                    <TableRow key={draft.id}>
                      <TableCell>
                        {company ? (
                          <Link className="font-medium text-primary" href={`/companies/${company.id}`}>
                            {company.name}
                          </Link>
                        ) : (
                          draft.companyId
                        )}
                      </TableCell>
                      <TableCell>{toEmail}</TableCell>
                      <TableCell>{draft.subject}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{labelValue(company?.buyerFitTier, buyerFitLabels, "未评分")}</Badge>
                      </TableCell>
                      <TableCell>{company?.leadScore ?? company?.buyerFitScore ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{draft.provider}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={draft.status === "approved" ? "success" : "outline"}>
                          {labelValue(draft.status, emailStatusLabels)}
                        </Badge>
                        {draft.status === "failed" && draft.errorMessage ? (
                          <div className="mt-1 text-xs text-destructive">{draft.errorMessage}</div>
                        ) : null}
                        {draft.status === "sent" && draft.sentAt ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDateTime(draft.sentAt)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDateTime(draft.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/companies/${draft.companyId}`}>
                              <Edit3 className="h-4 w-4" />
                              查看
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>编辑与审核</CardTitle>
          <CardDescription>本页只保存草稿状态，不真实发送邮件。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {drafts.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              暂无可审核邮件。
            </div>
          ) : (
            drafts.map((draft) => {
              const company = db.companies.find((item) => item.id === draft.companyId);

              return (
                <div className="rounded-md border p-4" key={`editor-${draft.id}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{company?.name ?? draft.companyId}</div>
                      <div className="text-xs text-muted-foreground">
                        {draft.toEmail ?? "无邮箱"} / {labelValue(draft.status, emailStatusLabels)}
                        {" "} / provider: {draft.provider}
                      </div>
                    </div>
                    <Badge variant={draft.status === "approved" ? "success" : "outline"}>
                      {labelValue(draft.status, emailStatusLabels)}
                    </Badge>
                  </div>
                  <EmailDraftActionPanel draft={draft} />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
