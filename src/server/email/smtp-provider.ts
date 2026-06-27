import type { EmailDraft } from "@/lib/types";
import type { MailSenderProvider } from "@/server/integrations/types";

export class SmtpMailSenderProvider implements MailSenderProvider {
  async saveDraft(draft: EmailDraft): Promise<EmailDraft> {
    void draft;
    throw new Error("SMTP provider is not enabled in the MVP. Use mockProviders.mailSender.");
  }
}
