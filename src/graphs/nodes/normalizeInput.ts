import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";

export async function normalizeInput(state: LeadGenerationGraphState) {
  const normalizedProduct = state.productInput.trim().replace(/\s+/g, " ").toLowerCase();

  return {
    normalizedProduct,
    ...completeNode(state, "normalizeInput", `Normalized product input to "${normalizedProduct}".`)
  };
}
