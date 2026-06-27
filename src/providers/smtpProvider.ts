import {
  envFlag,
  notImplementedProviderError,
  type ExternalProvider,
  type ProviderFactoryOptions
} from "@/providers/types";
import type { SendEmailInput } from "@/providers/resendProvider";

export interface SmtpOutput {
  provider: "mock-smtp" | "smtp";
  status: "draft_saved" | "sent";
  providerMessageId?: string;
}

export type SmtpProvider = ExternalProvider<SendEmailInput, SmtpOutput>;

export function createSmtpProvider(options: ProviderFactoryOptions = {}): SmtpProvider {
  const isConfigured =
    envFlag(process.env.SMTP_HOST) &&
    envFlag(process.env.SMTP_PORT) &&
    envFlag(process.env.SMTP_USER) &&
    envFlag(process.env.SMTP_PASS);
  const mode = options.mode ?? "mock";

  return {
    name: "smtp",
    mode,
    isConfigured,
    async invoke(input) {
      if (mode === "real") {
        throw notImplementedProviderError("SMTP");
      }

      return {
        provider: "mock-smtp",
        status: "draft_saved",
        providerMessageId: `mock-smtp:${input.to}:${Date.now()}`
      };
    }
  };
}

export const smtpProvider = createSmtpProvider();
