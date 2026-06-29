import type { EntityId } from "@/types";

export async function startMockLeadRun() {
  throw new Error("Legacy mock lead run is disabled. Use /api/runs/start instead.");
}

export async function approveKeywordsAndContinue(
  _runId: EntityId,
  _approvedKeywordIds: EntityId[]
) {
  void _runId;
  void _approvedKeywordIds;

  throw new Error("Legacy mock keyword continuation is disabled. Use review-service instead.");
}
