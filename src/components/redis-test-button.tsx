"use client";

import { useState } from "react";
import { Loader2, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RedisTestButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function testRedis() {
    setIsLoading(true);
    const response = await fetch("/api/settings/test-redis", {
      method: "POST"
    });
    setResult(await response.json());
    setIsLoading(false);
  }

  return (
    <div className="space-y-3">
      <Button disabled={isLoading} onClick={testRedis} type="button">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ServerCog className="h-4 w-4" />}
        测试 Redis 连接
      </Button>
      {result ? (
        <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

