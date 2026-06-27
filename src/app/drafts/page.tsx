import Link from "next/link";
import { Send } from "lucide-react";
import { ApproveDraftAction } from "@/components/review-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCustomers, listDrafts } from "@/server/storage/json-store";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const [drafts, customers] = await Promise.all([listDrafts(), listCustomers()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Email drafts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local draft inbox for mock outreach. Nothing here is sent to Resend or SMTP.
          </p>
        </div>
        <Button asChild>
          <Link href="/tasks/new">Create task</Link>
        </Button>
      </div>

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No drafts yet. Run the demo task first.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => {
            const customer = customers.find((item) => item.id === draft.customerId);

            return (
              <Card key={draft.id}>
                <CardHeader>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        <CardTitle>{draft.subject}</CardTitle>
                      </div>
                      <CardDescription>
                        To {draft.to} /{" "}
                        {customer ? (
                          <Link className="text-primary" href={`/customers/${customer.id}`}>
                            {customer.companyName}
                          </Link>
                        ) : (
                          "Unknown customer"
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border bg-muted px-2 py-1 text-xs">{draft.status}</span>
                      {draft.status === "draft" ? <ApproveDraftAction draftId={draft.id} /> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm leading-6">
                    {draft.body}
                  </pre>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
