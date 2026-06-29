import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/services/authService";
import { writeRequestAuditLog } from "@/services/auditLogService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();

  await writeRequestAuditLog(request, {
    action: "auth.logout",
    resourceType: "auth",
    resourceId: user?.id,
    status: "success",
    actorType: user ? "user" : "anonymous",
    actorId: user?.id
  });

  const url = new URL("/login", request.url);
  url.searchParams.set("message", "已退出登录。");
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  return POST(request);
}
