"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { CompanyStatus } from "@/types";

const statuses: CompanyStatus[] = [
  "new",
  "imported_candidate",
  "enriched",
  "scored",
  "drafted",
  "email_approved",
  "email_skipped",
  "contacted",
  "replied",
  "invalid",
  "blacklist",
  "saved_to_crm"
];

interface CompanyStatusFormProps {
  companyId: string;
  status?: CompanyStatus;
}

export function CompanyStatusForm({ companyId, status = "new" }: CompanyStatusFormProps) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<CompanyStatus>(status);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateStatus(nextStatus: CompanyStatus) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "Failed to update status.");
        return;
      }

      setSelectedStatus(nextStatus);
      setMessage("Status updated.");
      router.refresh();
    });
  }

  function blacklistCompany() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/companies/${companyId}/blacklist`, {
        method: "POST"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(payload?.error ?? "Failed to blacklist company.");
        return;
      }

      setSelectedStatus("blacklist");
      setMessage("Company added to blacklist.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={isPending}
          onChange={(event) => setSelectedStatus(event.target.value as CompanyStatus)}
          value={selectedStatus}
        >
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <Button disabled={isPending} onClick={() => updateStatus(selectedStatus)} type="button">
          保存状态
        </Button>
        <Button
          disabled={isPending || selectedStatus === "blacklist"}
          onClick={blacklistCompany}
          type="button"
          variant="destructive"
        >
          加入黑名单
        </Button>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
