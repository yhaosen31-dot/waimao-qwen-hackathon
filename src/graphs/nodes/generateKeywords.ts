import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { minimaxProvider } from "@/providers/minimaxProvider";

export async function generateKeywords(state: LeadGenerationGraphState) {
  if (state.keywords.length > 0) {
    return {
      keywords: state.keywords,
      keywordInsights: state.keywordInsights,
      ...completeNode(
        state,
        "generateKeywords",
        `Reused ${state.keywords.length} existing keywords for this review continuation.`
      )
    };
  }

  const productName = state.normalizedProduct ?? state.productInput;
  const providerResult = await minimaxProvider.invoke({
    productName,
    companyName: "keyword-planning",
    buyerSignals: ["importers", "hydraulic distributors", "industrial spare parts"]
  });
  const keywords = Array.from(
    new Set([
      productName,
      "hydraulic accumulator",
      "diaphragm accumulator supplier",
      "hydraulic accumulator importer",
      "industrial hydraulic accumulator",
      "pressure accumulator for hydraulic system",
      "nitrogen charged diaphragm accumulator",
      "hydraulic spare parts distributor"
    ])
  );
  const keywordInsights = keywords.map((keyword, index) => ({
    value: keyword,
    score: Math.max(0.68, 0.96 - index * 0.035),
    reason:
      index === 0
        ? "Exact normalized product phrase, highest precision for importer search."
        : `Mock ${providerResult.provider} signal: relevant hydraulic procurement phrase with importer intent.`
  }));

  return {
    keywords,
    keywordInsights,
    ...completeNode(
      state,
      "generateKeywords",
      `Generated ${keywords.length} mock keywords via ${providerResult.provider}.`
    )
  };
}
