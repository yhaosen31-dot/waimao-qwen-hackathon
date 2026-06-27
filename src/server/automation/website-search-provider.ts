import type { CompanyDetails, WebsiteResolverProvider } from "@/server/integrations/types";

export class SearchApiWebsiteResolverProvider implements WebsiteResolverProvider {
  async resolveMissingWebsites(companies: CompanyDetails[]): Promise<CompanyDetails[]> {
    void companies;
    throw new Error("Real website search API resolution is not enabled in the MVP.");
  }
}
