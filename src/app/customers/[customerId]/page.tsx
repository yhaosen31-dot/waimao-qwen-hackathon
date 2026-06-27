import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, Send, UserRound } from "lucide-react";
import { ScorePill } from "@/components/score-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCustomer, listDrafts } from "@/server/storage/json-store";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{
    customerId: string;
  }>;
}

export default async function CustomerDetailPage({ params }: Params) {
  const { customerId } = await params;
  const customer = await getCustomer(customerId);

  if (!customer) notFound();

  const drafts = await listDrafts(customer.taskId);
  const draft = drafts.find((item) => item.customerId === customer.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{customer.companyName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.city}, {customer.country} / {customer.domain}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/tasks/${customer.taskId}/run`}>Open task</Link>
          </Button>
          <Button asChild>
            <Link href="/customers">Back to CRM</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Buyer fit</CardTitle>
              <CardDescription>Mock scoring from product overlap and buyer profile.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <ScorePill score={customer.buyerFitScore} />
                <span className="text-sm text-muted-foreground">out of 100</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {customer.scoreReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-muted-foreground" />
                {customer.contactName}, {customer.contactTitle}
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {customer.emails[0]?.address}
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {customer.phone} / WhatsApp {customer.whatsapp}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company research</CardTitle>
              <CardDescription>{customer.source}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Website</div>
                <a className="mt-1 block text-primary" href={customer.website} rel="noreferrer" target="_blank">
                  {customer.website}
                </a>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Importer profile</div>
                <p className="mt-1 leading-6 text-muted-foreground">{customer.importerProfile}</p>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Product signals</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {customer.products.map((product) => (
                    <span className="rounded-md border bg-muted px-2 py-1 text-xs" key={product}>
                      {product}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Estimated import volume</div>
                <p className="mt-1 text-muted-foreground">{customer.annualImportEstimate}</p>
              </div>
            </CardContent>
          </Card>

          {draft ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  <CardTitle>Email draft</CardTitle>
                </div>
                <CardDescription>
                  Status: {draft.status}. This MVP saves drafts only and never sends.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border bg-muted/50 p-3 text-sm font-medium">{draft.subject}</div>
                <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-4 text-sm leading-6">
                  {draft.body}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
