import { resendProvider, type ResendSendEmailOutput } from "@/providers/resendProvider";
import { smtpProvider, type SmtpSendEmailOutput } from "@/providers/smtpProvider";
import {
  getEmailDraft,
  readStore,
  saveEmailLogs,
  updateCompany,
  updateEmailDraft
} from "@/repositories/store";
import type { EmailDraft, EmailLog, EntityId } from "@/types";

export interface SendEmailDraftResult {
  success: boolean;
  mode: "mock" | "real";
  provider: EmailSendProviderName;
  selectedProvider: EmailSendProviderName;
  emailDraft: EmailDraft;
  emailLog?: EmailLog;
  providerMessageId?: string;
  error?: string;
}

export type EmailSendProviderName = "resend" | "smtp" | "mock";
type EmailProviderSendOutput = ResendSendEmailOutput | SmtpSendEmailOutput | MockSendEmailOutput;

export interface TestEmailProviderResult {
  ok: boolean;
  selectedProvider: EmailSendProviderName;
  provider: EmailSendProviderName;
  mode: "mock" | "real";
  configured: boolean;
  realMode: boolean;
  providerMessageId?: string;
  error?: string;
  message: string;
}

interface MockSendEmailOutput {
  success: boolean;
  provider: "mock";
  providerMessageId?: string;
  error?: string;
  mode: "mock";
}

const activeSends = new Set<EntityId>();

export async function sendApprovedEmailDraft(emailDraftId: EntityId): Promise<SendEmailDraftResult> {
  if (activeSends.has(emailDraftId)) {
    throw new Error("This email draft is already being sent.");
  }

  activeSends.add(emailDraftId);

  try {
    return await sendApprovedEmailDraftUnsafe(emailDraftId);
  } finally {
    activeSends.delete(emailDraftId);
  }
}

async function sendApprovedEmailDraftUnsafe(emailDraftId: EntityId): Promise<SendEmailDraftResult> {
  const draft = await getEmailDraft(emailDraftId);

  if (!draft) {
    throw new Error("Email draft not found.");
  }

  if (draft.status === "sent") {
    throw new Error("This email draft was already sent.");
  }

  if (draft.status !== "approved") {
    throw new Error(`Only approved email drafts can be sent. Current status: ${draft.status}.`);
  }

  const db = await readStore();
  const company = db.companies.find((item) => item.id === draft.companyId);
  const toEmail = resolveDraftToEmail(draft, db.emailAddresses);

  if (!company) {
    throw new Error("Company not found for email draft.");
  }

  if (!toEmail) {
    const failedDraft = await updateEmailDraft(draft.id, {
      status: "failed",
      errorMessage: "No recipient email is available for this approved draft."
    });
    const [emailLog] = await saveEmailLogs(draft.runId, [
      buildEmailLog({
        draft,
        toEmail: "",
        provider: resolveActiveProvider().actualProvider,
        fromEmail: resolveActiveProvider().fromEmail,
        status: "failed",
        errorMessage: failedDraft.errorMessage
      })
    ]);

    return {
      success: false,
      mode: resolveActiveProvider().mode,
      provider: resolveActiveProvider().actualProvider,
      selectedProvider: resolveEmailProvider(),
      emailDraft: failedDraft,
      emailLog,
      error: failedDraft.errorMessage
    };
  }

  const selectedProvider = resolveEmailProvider();
  const sendResult = await sendEmailWithSelectedProvider(selectedProvider, {
    to: toEmail,
    subject: draft.subject,
    body: draft.body,
    companyId: company.id,
    emailDraftId: draft.id
  });

  if (!sendResult.success) {
    const failedDraft = await updateEmailDraft(draft.id, {
      status: "failed",
      errorMessage: sendResult.error ?? "Email send failed."
    });
    const [emailLog] = await saveEmailLogs(draft.runId, [
      buildEmailLog({
        draft,
        toEmail,
        provider: actualProviderFromSendResult(sendResult),
        fromEmail: fromEmailForProvider(selectedProvider),
        status: "failed",
        providerMessageId: sendResult.providerMessageId,
        errorMessage: sendResult.error
      })
    ]);

    return toServiceResult(sendResult, failedDraft, emailLog);
  }

  const now = new Date().toISOString();
  const sentDraft = await updateEmailDraft(draft.id, {
    status: "sent",
    sentAt: now,
    provider: actualProviderFromSendResult(sendResult),
    errorMessage: undefined
  });
  await updateCompany(company.id, {
    status: "contacted"
  });
  const [emailLog] = await saveEmailLogs(draft.runId, [
      buildEmailLog({
        draft,
        toEmail,
        provider: actualProviderFromSendResult(sendResult),
        fromEmail: fromEmailForProvider(selectedProvider),
        status: sendResult.mode === "real" ? "sent" : "mock_sent",
        providerMessageId: sendResult.providerMessageId
    })
  ]);

  return toServiceResult(sendResult, sentDraft, emailLog);
}

function toServiceResult(
  sendResult: EmailProviderSendOutput,
  emailDraft: EmailDraft,
  emailLog?: EmailLog
): SendEmailDraftResult {
  return {
    success: sendResult.success,
    mode: sendResult.mode,
    provider: actualProviderFromSendResult(sendResult),
    selectedProvider: resolveEmailProvider(),
    emailDraft,
    emailLog,
    providerMessageId: sendResult.providerMessageId,
    error: sendResult.error
  };
}

export function resolveEmailProvider(): EmailSendProviderName {
  const configured = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  if (configured === "resend" || configured === "smtp" || configured === "mock") return configured;
  return "mock";
}

export function emailProviderStatuses() {
  const selectedProvider = resolveEmailProvider();
  const resendStatus = resendProvider.status();
  const smtpStatus = smtpProvider.status();

  return {
    selectedProvider,
    realMode: process.env.EMAIL_SEND_REAL_MODE === "true",
    resend: resendStatus,
    smtp: smtpStatus,
    current: selectedProvider === "smtp" ? smtpStatus : selectedProvider === "resend" ? resendStatus : undefined
  };
}

export async function testEmailProvider(
  provider: EmailSendProviderName = resolveEmailProvider(),
  testEmail?: string
): Promise<TestEmailProviderResult> {
  const statuses = emailProviderStatuses();

  if (provider === "mock") {
    return {
      ok: true,
      selectedProvider: "mock",
      provider: "mock",
      mode: "mock",
      configured: true,
      realMode: statuses.realMode,
      providerMessageId: `mock_test_${Date.now()}`,
      message: "EMAIL_PROVIDER=mock. No real email was sent."
    };
  }

  const providerStatus = provider === "smtp" ? statuses.smtp : statuses.resend;

  if (providerStatus.mode === "mock") {
    return {
      ok: true,
      selectedProvider: provider,
      provider: "mock",
      mode: "mock",
      configured: providerStatus.configured,
      realMode: statuses.realMode,
      providerMessageId: `mock_${provider}_test_${Date.now()}`,
      message:
        statuses.realMode && !providerStatus.configured
          ? `${provider} is not fully configured. Test is mocked and no email was sent.`
          : "EMAIL_SEND_REAL_MODE=false. Test is mocked and no email was sent."
    };
  }

  if (!testEmail?.trim()) {
    return {
      ok: false,
      selectedProvider: provider,
      provider,
      mode: "real",
      configured: providerStatus.configured,
      realMode: statuses.realMode,
      error: "Provide testEmail to send a real test email.",
      message: "Provide testEmail to send a real test email."
    };
  }

  const result = await sendEmailWithSelectedProvider(provider, {
    to: testEmail.trim(),
    subject: `${provider.toUpperCase()} test from waimao-agent-platform`,
    body: "This is a single test email triggered from Settings.",
    companyId: "settings_test",
    emailDraftId: `settings_test_${provider}_${Date.now()}`
  });

  return {
    ok: result.success,
    selectedProvider: provider,
    provider: actualProviderFromSendResult(result),
    mode: result.mode,
    configured: providerStatus.configured,
    realMode: statuses.realMode,
    providerMessageId: result.providerMessageId,
    error: result.error,
    message: result.success ? "Test email sent." : "Test email failed."
  };
}

async function sendEmailWithSelectedProvider(
  provider: EmailSendProviderName,
  input: {
    to: string;
    subject: string;
    body: string;
    companyId: string;
    emailDraftId: string;
  }
): Promise<EmailProviderSendOutput> {
  if (provider === "smtp") return smtpProvider.sendEmail(input);
  if (provider === "resend") return resendProvider.sendEmail(input);
  return {
    success: true,
    provider: "mock",
    providerMessageId: `mock_email_${input.emailDraftId}_${Date.now()}`,
    mode: "mock"
  };
}

function actualProviderFromSendResult(sendResult: EmailProviderSendOutput): EmailSendProviderName {
  return sendResult.mode === "mock" ? "mock" : sendResult.provider;
}

function resolveActiveProvider() {
  const selectedProvider = resolveEmailProvider();
  if (selectedProvider === "smtp") {
    const status = smtpProvider.status();
    return {
      actualProvider: status.mode === "mock" ? ("mock" as const) : ("smtp" as const),
      mode: status.mode,
      fromEmail: status.fromEmail
    };
  }
  if (selectedProvider === "resend") {
    const status = resendProvider.status();
    return {
      actualProvider: status.mode === "mock" ? ("mock" as const) : ("resend" as const),
      mode: status.mode,
      fromEmail: status.fromEmail
    };
  }
  return {
    actualProvider: "mock" as const,
    mode: "mock" as const,
    fromEmail: process.env.SMTP_FROM_EMAIL?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || undefined
  };
}

function fromEmailForProvider(provider: EmailSendProviderName) {
  if (provider === "smtp") return smtpProvider.status().fromEmail;
  if (provider === "resend") return resendProvider.status().fromEmail;
  return process.env.SMTP_FROM_EMAIL?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || undefined;
}

function resolveDraftToEmail(
  draft: EmailDraft,
  emailAddresses: Array<{ id: string; companyId: string; email: string }>
) {
  return (
    draft.toEmail?.trim() ||
    emailAddresses.find((email) => email.id === draft.toEmailAddressId)?.email ||
    emailAddresses.find((email) => email.companyId === draft.companyId)?.email ||
    ""
  );
}

function buildEmailLog(input: {
  draft: EmailDraft;
  toEmail: string;
  provider: EmailLog["provider"];
  fromEmail?: string;
  status: EmailLog["status"];
  providerMessageId?: string;
  errorMessage?: string;
}) {
  return {
    emailDraftId: input.draft.id,
    companyId: input.draft.companyId,
    provider: input.provider,
    action: "send" as const,
    status: input.status,
    toEmail: input.toEmail,
    fromEmail: input.fromEmail,
    subject: input.draft.subject,
    providerMessageId: input.providerMessageId,
    errorMessage: input.errorMessage,
    attemptedAt: new Date().toISOString()
  };
}
