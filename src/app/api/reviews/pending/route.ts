import { NextResponse } from "next/server";
import { readReviewStore } from "@/repositories/store";

export const runtime = "nodejs";

export async function GET() {
  const db = await readReviewStore();
  const keywordRunIds = new Set(
    db.runSteps
      .filter((step) => step.stepKey === "humanApproveKeywords" && step.status === "waiting_review")
      .map((step) => step.runId)
  );
  const emailRunIds = new Set(
    db.runSteps
      .filter((step) => step.stepKey === "humanApproveEmail" && step.status === "waiting_review")
      .map((step) => step.runId)
  );

  const keywordReviews = db.runs
    .filter((run) => keywordRunIds.has(run.id))
    .map((run) => ({
      run,
      keywords: db.keywords.filter((keyword) => keyword.runId === run.id)
    }));
  const emailReviews = db.runs
    .filter((run) => emailRunIds.has(run.id))
    .map((run) => ({
      run,
      drafts: db.emailDrafts.filter(
        (draft) => draft.runId === run.id && draft.status === "waiting_review"
      )
    }));
  const completedReviews = db.runs.filter(
    (run) => run.keywordReviewStatus === "approved" && run.emailReviewStatus === "approved"
  );

  return NextResponse.json({
    keywordReviews,
    emailReviews,
    completedReviews
  });
}
