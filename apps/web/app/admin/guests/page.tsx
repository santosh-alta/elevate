import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/auth";
import Link from "next/link";
import { Search } from "lucide-react";
import { apiList } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { GuestProfile } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Table, Td, Textarea, Th } from "@/components/ui";
import { ApiForm } from "@/components/client/api-form";
import { GuestAvatar } from "@/components/guest-avatar";

export const metadata: Metadata = { title: "Guest library" };

export default async function GuestLibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaffPage();
  const { q = "" } = await searchParams;
  const profiles = await apiList<GuestProfile>(`/guest-profiles?q=${encodeURIComponent(q)}`);
  const count = (p: GuestProfile) => (typeof p.appearances === "number" ? p.appearances : Array.isArray(p.appearances) ? p.appearances.length : p._count?.appearances ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Guest library</h1>
        <p className="text-sm text-muted">Every speaker, founder, investor and chief guest who has joined our events, with their full history.</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardBody className="border-b border-border">
            <form className="flex gap-2" role="search">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
                <Input name="q" defaultValue={q} placeholder="Search name, company or expertise" className="pl-9" aria-label="Search guests" />
              </div>
              <Button type="submit" variant="outline">Search</Button>
            </form>
          </CardBody>
          {profiles.length ? (
            <Table>
              <thead><tr><Th>Guest</Th><Th>Expertise</Th><Th>Events</Th><Th>Last event</Th></tr></thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <Link href={`/admin/guests/${p.id}`} className="flex items-center gap-3 hover:text-primary">
                        <GuestAvatar guest={p} size="h-9 w-9" />
                        <span><span className="block font-medium">{p.name}</span><span className="block text-xs text-muted">{[p.designation, p.organization].filter(Boolean).join(", ")}</span></span>
                      </Link>
                    </Td>
                    <Td><div className="flex max-w-xs flex-wrap gap-1">{(p.expertise ?? []).slice(0, 3).map((x) => <Badge key={x}>{x}</Badge>)}</div></Td>
                    <Td className="tabular-nums">{count(p)}</Td>
                    <Td className="text-sm">{p.lastEvent ? <>{p.lastEvent.title}<span className="block text-xs text-muted">{fmtDate(p.lastEvent.startsAt)}</span></> : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <CardBody><EmptyState title={q ? "No guests match" : "No guests yet"} description="Guests you add to events are saved here automatically, so you can invite them again in one click." /></CardBody>}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Add to library" description="For people you plan to invite later" />
          <CardBody>
            <ApiForm path="/guest-profiles" className="space-y-3" redirectTo="/admin/guests/{id}">
              <Field label="Name"><Input name="name" required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Designation"><Input name="designation" /></Field>
                <Field label="Organisation"><Input name="organization" /></Field>
              </div>
              <Field label="Email"><Input name="email" type="email" /></Field>
              <Field label="LinkedIn"><Input name="linkedinUrl" type="url" /></Field>
              <Field label="Expertise" hint="Comma separated"><Input name="expertise:csv" placeholder="Fintech, Fundraising, Product" /></Field>
              <Field label="Notes (internal)"><Textarea name="notes" rows={3} /></Field>
              <Button type="submit" className="w-full">Save guest</Button>
            </ApiForm>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
