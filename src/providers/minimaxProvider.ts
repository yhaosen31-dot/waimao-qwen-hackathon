import {
  envFlag,
  notImplementedProviderError,
  type ExternalProvider,
  type ProviderFactoryOptions
} from "@/providers/types";

export interface MinimaxDraftInput {
  productName: string;
  companyName: string;
  buyerSignals: string[];
  contactName?: string;
  evidenceSummary?: string;
}

export interface MinimaxDraftOutput {
  subject: string;
  body: string;
  personalizationNotes: string[];
  provider: "mock-minimax" | "minimax";
}

export type MinimaxProvider = ExternalProvider<MinimaxDraftInput, MinimaxDraftOutput>;

export function createMinimaxProvider(options: ProviderFactoryOptions = {}): MinimaxProvider {
  const isConfigured = envFlag(process.env.MINIMAX_API_KEY);
  const mode = options.mode ?? "mock";

  return {
    name: "minimax",
    mode,
    isConfigured,
    async invoke(input) {
      if (mode === "real") {
        throw notImplementedProviderError("MiniMax");
      }

      return {
        subject: `Diaphragm accumulator supply for ${input.companyName}`,
        body: [
          `Hi ${input.contactName ?? "Procurement Team"},`,
          "",
          `I noticed ${input.companyName} has buyer signals around ${input.buyerSignals.join(", ")}.`,
          input.evidenceSummary ? `Evidence summary: ${input.evidenceSummary}` : "",
          `We manufacture ${input.productName} and related hydraulic accumulator parts for importers and distributors.`,
          "",
          "Could I send a short catalog and learn which pressure range you usually purchase?",
          "",
          "Best regards,"
        ].join("\n"),
        personalizationNotes: input.buyerSignals,
        provider: "mock-minimax"
      };
    }
  };
}

export const minimaxProvider = createMinimaxProvider();
