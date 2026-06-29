import { NextResponse } from "next/server";
import { z } from "zod";
import { smtpProvider } from "@/providers/smtpProvider";
import { testEmailProvider } from "@/services/emailSendService";
import { auditSettingsTest, guardSettingsTest } from "@/services/settingsGuardService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testSmtpSchema = z.object({
  testEmail: z.string().email().optional()
});

export async function POST(request: Request) {
  const limited = await guardSettingsTest(request, "settings.test_smtp");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const payload = testSmtpSchema.parse(body);
  const smtpStatus = smtpProvider.status();
  const result = await testEmailProvider("smtp", payload.testEmail);
  await auditSettingsTest(request, "settings.test_smtp", result.ok ? "success" : "failure", {
    configured: smtpStatus.configured,
    mode: smtpStatus.mode,
    realMode: result.realMode,
    testEmailProvided: Boolean(payload.testEmail)
  }, result.error);

  return NextResponse.json(
    {
      ...result,
      smtp: {
        configured: smtpStatus.configured,
        mode: smtpStatus.mode,
        host: smtpStatus.host,
        port: smtpStatus.port,
        fromEmail: smtpStatus.fromEmail,
        fromName: smtpStatus.fromName,
        secure: smtpStatus.secure
      }
    },
    { status: result.ok ? 200 : 400 }
  );
}
