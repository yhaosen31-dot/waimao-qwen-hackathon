import type { ImporterSearchProvider, RawImporterLead } from "@/server/integrations/types";

export class KjingPlaywrightImporterSearchProvider implements ImporterSearchProvider {
  async searchImporters(keywords: string[], targetCount: number): Promise<RawImporterLead[]> {
    void keywords;
    void targetCount;
    throw new Error(
      "KJing/Cross-search Playwright automation is disabled because account risk control was detected."
    );
  }
}
