import {
  envFlag,
  notImplementedProviderError,
  type ExternalProvider,
  type ProviderFactoryOptions
} from "@/providers/types";

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export interface SendEmailOutput {
  provider: "mock-resend" | "resend";
  status: "draft_saved" | "sent";
  providerMessageId?: string;
}

export type ResendProvider = ExternalProvider<SendEmailInput, SendEmailOutput>;

export function createResendProvider(options: ProviderFactoryOptions = {}): ResendProvider {
  const isConfigured = envFlag(process.env.RESEND_API_KEY);
  const mode = options.mode ?? "mock";

  return {
    name: "resend",
    mode,
    isConfigured,
    async invoke(input) {
      if (mode === "real") {
        throw notImplementedProviderError("Resend");
      }

      return {
        provider: "mock-resend",
        status: "draft_saved",
        providerMessageId: `mock-resend:${input.to}:${Date.now()}`
      };
    }
  };
}

export const resendProvider = createResendProvider();
