import { Badge } from "@/components/ui/badge";
import type { ReviewStatus, WorkflowStepStatus } from "@/lib/types";

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "approved") return <Badge variant="success">Approved</Badge>;
  if (status === "rejected") return <Badge variant="warning">Rejected</Badge>;
  return <Badge variant="warning">Pending review</Badge>;
}

export function StepStatusBadge({ status }: { status: WorkflowStepStatus }) {
  if (status === "completed") return <Badge variant="success">Completed</Badge>;
  if (status === "running") return <Badge variant="secondary">Running</Badge>;
  if (status === "blocked") return <Badge variant="warning">Blocked</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}
