"use client";

import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SupabaseTestButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function testSupabase() {
    setIsLoading(true);
    const response = await fetch("/api/settings/test-supabase", {
      method: "POST"
    });
    setResult(await response.json());
    setIsLoading(false);
  }

  return (
    <div className="space-y-3">
      <Button disabled={isLoading} onClick={testSupabase} type="button">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
        测试 Supabase 连接
      </Button>
      {result ? (
        <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
