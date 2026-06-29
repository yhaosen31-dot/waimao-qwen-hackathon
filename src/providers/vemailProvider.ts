import type { ExternalProvider } from "@/providers/types";

const DISABLED_MESSAGE =
  "VEmail/foreign-trade email lookup is disabled. Use EXA/Tavily/YOU contact search instead.";

export interface VEmailInput {
  domain: string;
  companyName?: string;
}

export interface VEmailResult {
  email: string;
  confidence: number;
  source: "vemail-disabled";
}

export type VEmailProvider = ExternalProvider<VEmailInput, VEmailResult[]>;

export function createVEmailProvider(): VEmailProvider {
  return {
    name: "vemail",
    mode: "mock",
    isConfigured: false,
    async invoke() {
      throw new Error(DISABLED_MESSAGE);
    }
  };
}

export const vemailProvider = createVEmailProvider();
