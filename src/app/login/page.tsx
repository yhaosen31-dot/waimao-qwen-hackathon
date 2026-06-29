import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { appAuthStatus, getCurrentAppUser } from "@/services/authService";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: Promise<{
    next?: string;
    error?: string;
    message?: string;
  }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const next = safeNext(params.next);
  const status = appAuthStatus();
  const user = await getCurrentAppUser();

  if (status.enabled && user) redirect(next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7faff] px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <CardTitle>登录外贸获客系统</CardTitle>
          <CardDescription>
            使用 Supabase Auth 登录。开启后，客户库、任务和 API 都需要登录。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status.enabled ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              当前登录保护未启用。配置 Supabase Auth 用户后，把 APP_AUTH_ENABLED=true 即可正式开启。
            </div>
          ) : null}
          {params.error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessage(params.error)}
            </div>
          ) : null}
          {params.message ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {params.message}
            </div>
          ) : null}
          <form action={`/auth/login?next=${encodeURIComponent(next)}`} className="space-y-3" method="post">
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                邮箱
              </label>
              <Input autoComplete="email" id="email" name="email" required type="email" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                密码
              </label>
              <Input autoComplete="current-password" id="password" name="password" required type="password" />
            </div>
            <Button className="w-full" type="submit">
              登录
            </Button>
          </form>
          <div className="text-xs leading-5 text-muted-foreground">
            第一位成功登录的用户会自动成为默认组织 owner。后续用户需要先加入 organization_members。
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function safeNext(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/runs/new";
  if (value.startsWith("/login") || value.startsWith("/auth/")) return "/runs/new";
  return value;
}

function errorMessage(error: string) {
  if (error === "invalid_credentials") {
    return "邮箱或密码不正确。如果你刚在 Supabase 创建用户，请确认使用的是完整邮箱，并重新设置一次密码。";
  }
  if (error === "email_not_confirmed") {
    return "这个邮箱还没有确认。请在 Supabase 用户详情里确认邮箱，或重新发送确认邮件。";
  }
  if (error === "too_many_attempts") {
    return "登录尝试太频繁，请稍等一会儿再试。";
  }
  if (error === "not_member") {
    return "该账号未加入当前组织，不能访问客户库。";
  }
  if (error === "auth_not_configured") {
    return "Supabase Auth 尚未配置完整。";
  }
  return "登录失败，请稍后重试。";
}
