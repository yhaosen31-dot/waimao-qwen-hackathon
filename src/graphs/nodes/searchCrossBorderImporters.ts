import { completeNode, type LeadGenerationGraphState } from "@/graphs/state";
import { crossSearchProvider } from "@/providers/crossSearchProvider";

export async function searchCrossBorderImporters(state: LeadGenerationGraphState) {
  const candidates = await crossSearchProvider.invoke({
    keywords: state.approvedKeywords,
    targetCount: state.targetCount
  });

  return {
    candidates,
    ...completeNode(
      state,
      "searchCrossBorderImporters",
      `Found ${candidates.length} mock importer candidates via ${crossSearchProvider.name}.`
    )
  };
}
