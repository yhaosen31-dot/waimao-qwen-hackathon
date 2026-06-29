import { NextResponse } from "next/server";
import { z } from "zod";
import { resendProvider } from "@/providers/resendProvider";
import { auditSettingsTest, guardSettingsTest } from "@/services/settingsGuardService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testResendSchema = z.object({
  testEmail: z.string().email().optional()
});

export async function POST(request: Request) {
  const limited = await guardSettingsTest(request, "settings.test_resend");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const payload = testResendSchema.parse(body);
  const status = resendProvider.status();

  if (!status.realMode) {
    await auditSettingsTest(request, "settings.test_resend", "success", {
      mode: "mock",
      realMode: false,
      configured: status.configured
    });
    return NextResponse.json({
      ok: true,
      configured: status.configured,
      mode: "mock",
      realMode: false,
      fromEmail: status.fromEmail,
      fromName: status.fromName,
      message: "EMAIL_SEND_REAL_MODE=false. Resend test is mocked and no email was sent."
    });
  }

  if (!status.configured) {
    await auditSettingsTest(request, "settings.test_resend", "success", {
      mode: "mock",
      realMode: true,
      configured: false
    });
    return NextResponse.json({
      ok: true,
      configured: false,
      mode: "mock",
      realMode: true,
      fromEmail: status.fromEmail,
      fromName: status.fromName,
      message: "RESEND_API_KEY is not configured. Resend test is mocked and no email was sent."
    });
  }

  if (!payload.testEmail) {
    await auditSettingsTest(request, "settings.test_resend", "failure", {
      mode: "real",
      realMode: true,
      configured: true,
      testEmailProvided: false
    }, "Missing testEmail");
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        mode: "real",
        realMode: true,
        fromEmail: status.fromEmail,
        fromName: status.fromName,
        message: "Provide testEmail to send a real Resend test email."
      },
      { status: 400 }
    );
  }

  const result = await resendProvider.sendEmail({
    to: payload.testEmail,
    subject: "Resend test from waimao-agent-platform",
    body: "This is a single test email triggered from Settings.",
    companyId: "settings_test",
    emailDraftId: "settings_test"
  });
  await auditSettingsTest(request, "settings.test_resend", result.success ? "success" : "failure", {
    mode: result.mode,
    realMode: true,
    configured: true,
    testEmailProvided: true
  }, result.error);

  return NextResponse.json(
    {
      ok: result.success,
      configured: true,
      mode: result.mode,
      realMode: true,
      fromEmail: status.fromEmail,
      fromName: status.fromName,
      providerMessageId: result.providerMessageId,
      error: result.error,
      message: result.success ? "Test email sent." : "Test email failed."
    },
    { status: result.success ? 200 : 502 }
  );
}
