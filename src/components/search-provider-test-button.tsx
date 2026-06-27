"use client";

import { useState } from "react";
import { Loader2, SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProviderStatus = Record<
  string,
  {
    configured: boolean;
    ok: boolean;
    mode: string;
    lastError?: string;
  }
>;

export function SearchProviderTestButton() {
  const [statuses, setStatuses] = useState<ProviderStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function testProviders() {
    setIsLoading(true);
    const response = await fetch("/api/settings/test-search-providers", {
      method: "POST"
    });
    setStatuses((await response.json()) as ProviderStatus);
    setIsLoading(false);
  }

  return (
    <div className="space-y-3">
      <Button disabled={isLoading} onClick={testProviders}>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
        测试搜索连接
      </Button>
      {statuses ? (
        <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(statuses, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
