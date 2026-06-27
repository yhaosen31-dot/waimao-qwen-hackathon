import {
  completeNode,
  waitForReviewNode,
  type LeadGenerationGraphState
} from "@/graphs/state";

export async function humanApproveEmail(state: LeadGenerationGraphState) {
  const allDraftsReviewed =
    state.emailDrafts.length > 0 &&
    state.emailDrafts.every((draft) => draft.status === "approved" || draft.status === "skipped");

  if (!allDraftsReviewed) {
    return waitForReviewNode(
      state,
      "humanApproveEmail",
      "Waiting for human email draft approval."
    );
  }

  const approvedCount = state.emailDrafts.filter((draft) => draft.status === "approved").length;
  const skippedCount = state.emailDrafts.filter((draft) => draft.status === "skipped").length;

  return completeNode(
    state,
    "humanApproveEmail",
    `Reviewed ${state.emailDrafts.length} drafts: ${approvedCount} approved, ${skippedCount} skipped.`
  );
}
