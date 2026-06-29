import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7faff] px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500 text-white">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <CardTitle>没有组织访问权限</CardTitle>
          <CardDescription>
            该账号已登录，但还不是当前组织成员。请用 owner 账号在 Supabase 的 organization_members 表中添加该用户。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/auth/logout" method="post">
            <Button className="w-full" type="submit" variant="outline">
              退出并切换账号
            </Button>
          </form>
          <Button asChild className="w-full">
            <Link href="/login">返回登录页</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
