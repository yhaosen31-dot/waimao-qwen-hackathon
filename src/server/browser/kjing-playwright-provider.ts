import type { ImporterSearchProvider, RawImporterLead } from "@/server/integrations/types";

export class KjingPlaywrightImporterSearchProvider implements ImporterSearchProvider {
  async searchImporters(keywords: string[], targetCount: number): Promise<RawImporterLead[]> {
    void keywords;
    void targetCount;
    throw new Error(
      "KJing Playwright automation is reserved for a later milestone and is not enabled in the MVP."
    );
  }
}
