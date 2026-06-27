import { Badge } from "@/components/ui/badge";
import type { RunStepStatus } from "@/types";

export function RunStepStatusBadge({ status }: { status: RunStepStatus }) {
  if (status === "completed") return <Badge variant="success">completed</Badge>;
  if (status === "running") return <Badge variant="secondary">running</Badge>;
  if (status === "waiting_review") return <Badge variant="warning">waiting_review</Badge>;
  if (status === "failed") return <Badge variant="warning">failed</Badge>;
  if (status === "paused") return <Badge variant="outline">paused</Badge>;
  if (status === "skipped") return <Badge variant="outline">skipped</Badge>;
  return <Badge variant="outline">pending</Badge>;
}
