import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { contentModelProvider } from "@/providers/contentModelProvider";

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
  const generated = await contentModelProvider.generateProductKeywords({
    productInput: productName,
    targetCount: state.targetCount,
    targetCountries: state.targetCountries,
    excludedCountries: state.excludedCountries
  });
  const keywords = generated.map((item) => item.keyword);
  const keywordInsights = generated.map((item) => ({
    value: item.keyword,
    score: item.score,
    reason: `${item.reason} Risk: ${item.riskLevel}.`
  }));

  return {
    keywords,
    keywordInsights,
    ...completeNode(
      state,
      "generateKeywords",
      `Generated ${keywords.length} product-specific keywords via ${contentModelProvider.name}.`
    )
  };
}
