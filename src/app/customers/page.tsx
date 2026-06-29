import Link from "next/link";
import { Mail, Phone, Users } from "lucide-react";
import { ScorePill } from "@/components/score-pill";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCustomers } from "@/server/storage/json-store";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await listCustomers();
  const averageScore =
    customers.length > 0
      ? Math.round(customers.reduce((sum, customer) => sum + customer.buyerFitScore, 0) / customers.length)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Customer CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Imported and searched customer records enriched with contacts, domains, scores, and outreach context.
          </p>
        </div>
        <Button asChild>
          <Link href="/tasks/new">Create another task</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Users} label="Customers" value={customers.length} />
        <StatCard icon={Mail} label="Domains with email" value={customers.filter((item) => item.emails.length).length} />
        <StatCard icon={Phone} label="Average score" value={averageScore} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All customers</CardTitle>
          <CardDescription>Sorted by Buyer Fit score.</CardDescription>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No CRM customers yet. Create a task first.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link className="font-medium text-primary" href={`/customers/${customer.id}`}>
                        {customer.companyName}
                      </Link>
                      <div className="text-xs text-muted-foreground">{customer.website}</div>
                    </TableCell>
                    <TableCell>
                      {customer.city}, {customer.country}
                    </TableCell>
                    <TableCell>{customer.emails[0]?.address ?? "No email"}</TableCell>
                    <TableCell>{customer.whatsapp}</TableCell>
                    <TableCell>
                      <ScorePill score={customer.buyerFitScore} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
