import type { EmailDraft } from "@/lib/types";
import type { MailSenderProvider } from "@/server/integrations/types";

export class ResendMailSenderProvider implements MailSenderProvider {
  async saveDraft(draft: EmailDraft): Promise<EmailDraft> {
    void draft;
    throw new Error("Resend provider is not enabled in the MVP. Use mockProviders.mailSender.");
  }
}
