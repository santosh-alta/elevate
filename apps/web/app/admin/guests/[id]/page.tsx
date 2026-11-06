import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Linkedin, Mail, Phone } from "lucide-react";
import { apiGet } from "@/lib/api";
import { fmtDate, humanize, typeLabel } from "@/lib/format";
import type { Guest, GuestProfile } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, LinkButton, StatusBadge, Table, Td, Textarea, Th } from "@/components/ui";
import { ApiForm } from "@/components/client/api-form";
import { UploadField } from "@/components/client/uploader";
import { GuestAvatar } from "@/components/guest-avatar";

export const metadata: Metadata = { title: "Guest profile" };

export default async function GuestProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await apiGet<GuestProfile>(`/guest-profiles/${id}`);
  if (!p) notFound();
  // API returns appearances as [{ guestId, role, status, talkTitle, sessionAt, event }]
  const appearances = ((Array.isArray(p.appearances) ? p.appearances : []) as (Guest & { guestId?: string })[])
    .map((a) => ({ ...a, id: a.guestId ?? a.id }));
  appearances.sort((a, b) => +new Date(b.event?.startsAt ?? 0) - +new Date(a.event?.startsAt ?? 0));

  return (
    <div className="space-y-6">
      <Link href="/admin/guests" className="text-sm text-muted hover:text-fg">← Guest library</Link>
      <div className="flex flex-wrap items-center gap-5">
        <GuestAvatar guest={p} size="h-20 w-20" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{p.name}</h1>
          <p className="text-muted">{[p.designation, p.organization].filter(Boolean).join(", ")}{p.city ? ` · ${p.city}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-1">{(p.expertise ?? []).map((x) => <Badge key={x}>{x}</Badge>)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.email && <LinkButton href={`mailto:${p.email}`} external variant="outline" size="sm"><Mail className="h-4 w-4" />Email</LinkButton>}
          {p.phone && <LinkButton href={`tel:${p.phone}`} external variant="outline" size="sm"><Phone className="h-4 w-4" />Call</LinkButton>}
          {p.linkedinUrl && <LinkButton href={p.linkedinUrl} external variant="outline" size="sm"><Linkedin className="h-4 w-4" />LinkedIn</LinkButton>}
          {p.websiteUrl && <LinkButton href={p.websiteUrl} external variant="outline" size="sm"><Globe className="h-4 w-4" />Website</LinkButton>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <Card className="h-fit">
          <CardHeader title="Events" description={`${appearances.length} appearance${appearances.length === 1 ? "" : "s"}`} />
          {appearances.length ? (
            <Table>
              <thead><tr><Th>Event</Th><Th>Role</Th><Th>Talk</Th><Th>Status</Th></tr></thead>
              <tbody>
                {appearances.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      {a.event ? <Link href={`/admin/events/${a.event.id}?tab=guests&guest=${a.id}`} className="font-medium hover:text-primary">{a.event.title}</Link> : "—"}
                      {a.event && <span className="block text-xs text-muted">{fmtDate(a.event.startsAt)} · {typeLabel(a.event.type)}</span>}
                    </Td>
                    <Td>{humanize(a.role ?? "SPEAKER")}</Td>
                    <Td className="max-w-xs truncate text-sm">{a.talkTitle ?? "—"}</Td>
                    <Td><StatusBadge status={a.status ?? "PROPOSED"} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <CardBody><EmptyState title="Not at any event yet" description="Open an event's Guests tab and add them from the library." /></CardBody>}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Profile" description="Copied into each new event they join" />
          <CardBody>
            <ApiForm method="PATCH" path={`/guest-profiles/${p.id}`} resetOnSuccess={false} successMessage="Profile saved." className="space-y-3">
              <Field label="Photo"><UploadField name="photoUrl" defaultValue={p.photoUrl} /></Field>
              <Field label="Name"><Input name="name" required defaultValue={p.name} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Designation"><Input name="designation" defaultValue={p.designation ?? ""} /></Field>
                <Field label="Organisation"><Input name="organization" defaultValue={p.organization ?? ""} /></Field>
                <Field label="Email"><Input name="email" type="email" defaultValue={p.email ?? ""} /></Field>
                <Field label="Phone"><Input name="phone" defaultValue={p.phone ?? ""} /></Field>
                <Field label="City"><Input name="city" defaultValue={p.city ?? ""} /></Field>
                <Field label="Website"><Input name="websiteUrl" type="url" defaultValue={p.websiteUrl ?? ""} /></Field>
              </div>
              <Field label="LinkedIn"><Input name="linkedinUrl" type="url" defaultValue={p.linkedinUrl ?? ""} /></Field>
              <Field label="Expertise" hint="Comma separated"><Input name="expertise:csv" defaultValue={(p.expertise ?? []).join(", ")} /></Field>
              <Field label="Bio"><Textarea name="bio" rows={5} defaultValue={p.bio ?? ""} /></Field>
              <Field label="Internal notes" hint="Never shown publicly"><Textarea name="notes" rows={3} defaultValue={p.notes ?? ""} /></Field>
              <Button type="submit" className="w-full">Save profile</Button>
            </ApiForm>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
