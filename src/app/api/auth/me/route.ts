import { NextResponse } from "next/server";
import { appAuthStatus, getCurrentAppUser } from "@/services/authService";

export async function GET() {
  const auth = appAuthStatus();
  const user = auth.enabled ? await getCurrentAppUser() : null;

  return NextResponse.json({
    ok: true,
    auth,
    user: user
      ? {
          id: user.id,
          email: user.email
        }
      : null
  });
}
