import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { contentModelProvider } from "@/providers/contentModelProvider";

export async function normalizeInput(state: LeadGenerationGraphState) {
  const normalized = await contentModelProvider.normalizeProductName({
    productInput: state.productInput
  });
  const normalizedProduct = normalized.normalizedProduct;
  const suffix = normalized.translated
    ? ` Translated product input from "${normalized.originalProduct}" to "${normalizedProduct}".`
    : "";

  return {
    normalizedProduct,
    errors: normalized.fallbackReason ? [...state.errors, normalized.fallbackReason] : state.errors,
    ...completeNode(
      state,
      "normalizeInput",
      `Normalized product input to "${normalizedProduct}" via ${contentModelProvider.name}.${suffix}`
    )
  };
}
