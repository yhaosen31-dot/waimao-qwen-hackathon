import nodemailer from "nodemailer";
import { envFlag } from "@/providers/types";

export interface SmtpSendEmailInput {
  to: string;
  subject: string;
  body: string;
  companyId: string;
  emailDraftId: string;
}

export interface SmtpSendEmailOutput {
  success: boolean;
  provider: "smtp";
  providerMessageId?: string;
  error?: string;
  mode: "mock" | "real";
}

export interface SmtpProviderStatus {
  configured: boolean;
  realMode: boolean;
  mode: "mock" | "real";
  host?: string;
  port?: number;
  fromEmail?: string;
  fromName?: string;
  secure: boolean;
}

export const smtpProvider = {
  status(): SmtpProviderStatus {
    return resolveSmtpStatus();
  },

  async sendEmail(input: SmtpSendEmailInput): Promise<SmtpSendEmailOutput> {
    const status = resolveSmtpStatus();

    if (!status.realMode || !status.configured) {
      return {
        success: true,
        provider: "smtp",
        providerMessageId: `mock_smtp_${input.emailDraftId}_${Date.now()}`,
        mode: "mock"
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: status.host,
        port: status.port,
        secure: status.secure,
        auth: {
          user: process.env.SMTP_USER?.trim(),
          pass: smtpPassword()
        }
      });

      const info = await transporter.sendMail({
        from: formatFromAddress(status.fromName, status.fromEmail ?? ""),
        to: input.to,
        subject: input.subject,
        text: input.body,
        headers: {
          "X-Waimao-Email-Draft-Id": input.emailDraftId,
          "X-Waimao-Company-Id": input.companyId
        }
      });

      return {
        success: true,
        provider: "smtp",
        providerMessageId: info.messageId,
        mode: "real"
      };
    } catch (error) {
      return {
        success: false,
        provider: "smtp",
        error: error instanceof Error ? error.message : "Unknown SMTP send error.",
        mode: "real"
      };
    }
  }
};

function resolveSmtpStatus(): SmtpProviderStatus {
  const host = process.env.SMTP_HOST?.trim() || undefined;
  const rawPort = process.env.SMTP_PORT?.trim();
  const port = rawPort ? Number(rawPort) : undefined;
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim() || undefined;
  const fromName = process.env.SMTP_FROM_NAME?.trim() || undefined;
  const secure = (process.env.SMTP_SECURE ?? "true").toLowerCase() !== "false";
  const configured =
    envFlag(host) &&
    Boolean(port && Number.isFinite(port)) &&
    envFlag(process.env.SMTP_USER) &&
    envFlag(smtpPassword()) &&
    envFlag(fromEmail);
  const realMode = process.env.EMAIL_SEND_REAL_MODE === "true";

  return {
    configured,
    realMode,
    mode: realMode && configured ? "real" : "mock",
    host,
    port,
    fromEmail,
    fromName,
    secure
  };
}

function smtpPassword() {
  return process.env.SMTP_PASSWORD?.trim() || process.env.SMTP_PASS?.trim() || "";
}

function formatFromAddress(fromName: string | undefined, fromEmail: string) {
  if (!fromName) return fromEmail;
  const safeName = fromName.replace(/["<>]/g, "").trim();
  return safeName ? `${safeName} <${fromEmail}>` : fromEmail;
}
