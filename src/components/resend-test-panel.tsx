"use client";

import { useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResendTestPanel() {
  const [testEmail, setTestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function testResend() {
    setSubmitting(true);
    setMessage(null);

    const response = await fetch("/api/settings/test-resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        testEmail: testEmail.trim() || undefined
      })
    });
    const payload = (await response.json()) as {
      message?: string;
      error?: string;
      mode?: "mock" | "real";
      providerMessageId?: string;
    };

    setSubmitting(false);
    setMessage(
      payload.message ??
        payload.error ??
        (response.ok ? `Resend ${payload.mode ?? "mock"} test completed.` : "Resend test failed.")
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        className="max-w-sm"
        onChange={(event) => setTestEmail(event.target.value)}
        placeholder="test@example.com"
        type="email"
        value={testEmail}
      />
      <Button disabled={submitting} onClick={testResend} type="button">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        发送测试邮件
      </Button>
      {message ? <div className="self-center text-sm text-muted-foreground">{message}</div> : null}
    </div>
  );
}
