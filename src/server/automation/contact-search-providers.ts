import type { CompanyDetails, ContactIntel, ContactIntelProvider } from "@/server/integrations/types";

export class ExaContactIntelProvider implements ContactIntelProvider {
  async enrichContact(company: CompanyDetails): Promise<ContactIntel> {
    void company;
    throw new Error("EXA contact search is not enabled in the MVP.");
  }
}

export class TavilyContactIntelProvider implements ContactIntelProvider {
  async enrichContact(company: CompanyDetails): Promise<ContactIntel> {
    void company;
    throw new Error("Tavily contact search is not enabled in the MVP.");
  }
}

export class YouContactIntelProvider implements ContactIntelProvider {
  async enrichContact(company: CompanyDetails): Promise<ContactIntel> {
    void company;
    throw new Error("YOU contact search is not enabled in the MVP.");
  }
}
