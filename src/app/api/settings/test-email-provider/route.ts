import { NextResponse } from "next/server";
import { z } from "zod";
import { emailProviderStatuses, testEmailProvider } from "@/services/emailSendService";
import { auditSettingsTest, guardSettingsTest } from "@/services/settingsGuardService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testEmailProviderSchema = z.object({
  testEmail: z.string().email().optional()
});

export async function POST(request: Request) {
  const limited = await guardSettingsTest(request, "settings.test_email_provider");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const payload = testEmailProviderSchema.parse(body);
  const statuses = emailProviderStatuses();
  const result = await testEmailProvider(statuses.selectedProvider, payload.testEmail);
  await auditSettingsTest(request, "settings.test_email_provider", result.ok ? "success" : "failure", {
    provider: statuses.selectedProvider,
    realMode: statuses.realMode,
    testEmailProvided: Boolean(payload.testEmail)
  }, result.error);

  return NextResponse.json(
    {
      ...result,
      settings: {
        selectedProvider: statuses.selectedProvider,
        realMode: statuses.realMode,
        resendConfigured: statuses.resend.configured,
        smtpConfigured: statuses.smtp.configured
      }
    },
    { status: result.ok ? 200 : 400 }
  );
}
