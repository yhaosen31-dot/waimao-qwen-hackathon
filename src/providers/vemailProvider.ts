import {
  envFlag,
  notImplementedProviderError,
  type ExternalProvider,
  type ProviderFactoryOptions
} from "@/providers/types";

export interface VEmailInput {
  domain: string;
  companyName?: string;
}

export interface VEmailResult {
  email: string;
  confidence: number;
  source: "mock-vemail" | "vemail";
}

export type VEmailProvider = ExternalProvider<VEmailInput, VEmailResult[]>;

export function createVEmailProvider(options: ProviderFactoryOptions = {}): VEmailProvider {
  const isConfigured = envFlag(process.env.VEMAIL_API_KEY);
  const mode = options.mode ?? "mock";

  return {
    name: "vemail",
    mode,
    isConfigured,
    async invoke(input) {
      if (mode === "real") {
        throw notImplementedProviderError("VEmail");
      }

      return [
        {
          email: `procurement@${input.domain}`,
          confidence: 0.9,
          source: "mock-vemail"
        },
        {
          email: `sales@${input.domain}`,
          confidence: 0.75,
          source: "mock-vemail"
        }
      ];
    }
  };
}

export const vemailProvider = createVEmailProvider();
