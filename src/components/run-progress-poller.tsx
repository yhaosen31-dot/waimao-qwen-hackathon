"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface RunProgressPollerProps {
  runId: string;
  status: string;
}

export function RunProgressPoller({ runId, status }: RunProgressPollerProps) {
  const router = useRouter();

  useEffect(() => {
    if (!["queued", "running"].includes(status)) return;

    const interval = window.setInterval(async () => {
      await fetch(`/api/runs/${runId}`, {
        cache: "no-store"
      }).catch(() => null);
      router.refresh();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [router, runId, status]);

  return null;
}

