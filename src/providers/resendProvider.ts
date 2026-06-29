import { fetchWithTimeout } from "@/providers/providerFetch";
import { envFlag } from "@/providers/types";

export interface ResendSendEmailInput {
  to: string;
  subject: string;
  body: string;
  companyId: string;
  emailDraftId: string;
}

export interface ResendSendEmailOutput {
  success: boolean;
  provider: "resend";
  providerMessageId?: string;
  error?: string;
  mode: "mock" | "real";
}

export interface ResendProviderStatus {
  configured: boolean;
  realMode: boolean;
  mode: "mock" | "real";
  fromEmail?: string;
  fromName?: string;
}

export const resendProvider = {
  status(): ResendProviderStatus {
    return resolveResendStatus();
  },

  async sendEmail(input: ResendSendEmailInput): Promise<ResendSendEmailOutput> {
    const status = resolveResendStatus();

    if (!status.realMode || !status.configured) {
      return {
        success: true,
        provider: "resend",
        providerMessageId: `mock_resend_${input.emailDraftId}_${Date.now()}`,
        mode: "mock"
      };
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
    if (!fromEmail) {
      return {
        success: false,
        provider: "resend",
        error: "RESEND_FROM_EMAIL is not configured.",
        mode: "real"
      };
    }

    try {
      const response = await fetchWithTimeout(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}`,
            "Content-Type": "application/json",
            "Idempotency-Key": input.emailDraftId
          },
          body: JSON.stringify({
            from: formatFromAddress(status.fromName, fromEmail),
            to: [input.to],
            subject: input.subject,
            text: input.body
          })
        },
        30_000
      );

      const payload = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
        error?: string;
      };

      if (!response.ok) {
        return {
          success: false,
          provider: "resend",
          error: payload.message ?? payload.error ?? `Resend API returned ${response.status}.`,
          mode: "real"
        };
      }

      return {
        success: true,
        provider: "resend",
        providerMessageId: payload.id,
        mode: "real"
      };
    } catch (error) {
      return {
        success: false,
        provider: "resend",
        error: error instanceof Error ? error.message : "Unknown Resend send error.",
        mode: "real"
      };
    }
  }
};

function resolveResendStatus(): ResendProviderStatus {
  const configured = envFlag(process.env.RESEND_API_KEY);
  const realMode = process.env.EMAIL_SEND_REAL_MODE === "true";
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || undefined;
  const fromName = process.env.RESEND_FROM_NAME?.trim() || undefined;

  return {
    configured,
    realMode,
    mode: realMode && configured ? "real" : "mock",
    fromEmail,
    fromName
  };
}

function formatFromAddress(fromName: string | undefined, fromEmail: string) {
  if (!fromName) return fromEmail;
  const safeName = fromName.replace(/["<>]/g, "").trim();
  return safeName ? `${safeName} <${fromEmail}>` : fromEmail;
}
