"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateTaskForm() {
  const router = useRouter();
  const [productName, setProductName] = useState("diaphragm accumulator");
  const [targetCount, setTargetCount] = useState(20);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productName,
          targetCount
        })
      });

      if (!response.ok) {
        throw new Error("Could not create task.");
      }

      const data = (await response.json()) as { taskId: string };
      router.push(`/tasks/${data.taskId}/run`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create lead generation task</CardTitle>
        <CardDescription>
          Runs the lead generation workflow and saves results to local JSON.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-[1fr_180px_auto]" onSubmit={submitTask}>
          <div className="space-y-2">
            <Label htmlFor="productName">Product name</Label>
            <Input
              id="productName"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="diaphragm accumulator"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetCount">Target count</Label>
            <Input
              id="targetCount"
              min={1}
              max={50}
              type="number"
              value={targetCount}
              onChange={(event) => setTargetCount(Number(event.target.value))}
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full md:w-auto" disabled={isSubmitting} type="submit">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run workflow
            </Button>
          </div>
        </form>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
