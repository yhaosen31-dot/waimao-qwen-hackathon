import Link from "next/link";
import { Edit3, MailCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listEmailDrafts, readStore } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EmailDraftsPage() {
  const [drafts, db] = await Promise.all([listEmailDrafts(), readStore()]);

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
                        <Badge variant={draft.status === "approved" ? "success" : "outline"}>
                          {draft.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(draft.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/runs/${draft.runId}`}>
                              <Edit3 className="h-4 w-4" />
                              编辑
                            </Link>
                          </Button>
                          <Button asChild size="sm">
                            <Link href={`/runs/${draft.runId}`}>
                              <MailCheck className="h-4 w-4" />
                              审核
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
    </div>
  );
}
