import {
  completeNode,
  waitForReviewNode,
  type LeadGenerationGraphState
} from "@/graphs/state";

export async function humanApproveKeywords(state: LeadGenerationGraphState) {
  if (state.approvedKeywords.length === 0) {
    return waitForReviewNode(
      state,
      "humanApproveKeywords",
      "Waiting for human keyword approval."
    );
  }

  return completeNode(
    state,
    "humanApproveKeywords",
    `Approved ${state.approvedKeywords.length} keywords and continued the workflow.`
  );
}
