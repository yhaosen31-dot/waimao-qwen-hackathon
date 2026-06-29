import Link from "next/link";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { ExcelImportForm } from "@/components/excel-import-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function NewImportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Excel 导入获客</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传 Excel 或 CSV，先完成解析、字段映射、清洗和去重。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/companies">
            <ArrowLeft className="h-4 w-4" />
            返回客户列表
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-700">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>上传表格</CardTitle>
              <CardDescription>支持 .xlsx、.xls、.csv。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ExcelImportForm />
        </CardContent>
      </Card>
    </div>
  );
}
