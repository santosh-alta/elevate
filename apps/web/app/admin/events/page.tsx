import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { EVENT_FAMILIES, EVENT_STATUSES } from "@elevate/shared";
import { getEventTypes, getTags } from "@/lib/catalog";
import { apiList } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { getMe, isOrganizerOnly } from "@/lib/auth";
import { eventCampuses, eventCount, eventFamily, eventLabel, familyLabel, fmtRange, humanize, isFamily, typeLabel } from "@/lib/format";
import type { ElevateEvent } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, LinkButton, Select, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Events" };

export default async function AdminEvents({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [tenant, me] = await Promise.all([requireTenant(), getMe()]);
  const qs = new URLSearchParams();
  if (isOrganizerOnly(me)) qs.set("mine", "true");
  for (const k of ["status", "type", "campusId", "tag", "categoryId", "q"]) if (sp[k]) qs.set(k, sp[k]!);
  const family = isFamily(sp.family) ? sp.family : undefined;
  if (family) qs.set("family", family);
  const [list, tags, families] = await Promise.all([apiList<ElevateEvent>(`/events?${qs}`), getTags(true), getEventTypes(true)]);
  const tag = sp.tag?.toLowerCase();
  const events = list
    .filter((e) => (!family || eventFamily(e) === family) && (!tag || !e.tags || e.tags.some((t) => t.toLowerCase() === tag)))
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  const categories = families.flatMap((f) => f.custom);
  const typeOptions = (family ? EVENT_FAMILIES.filter((f) => f.key === family) : EVENT_FAMILIES);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Events</h1>
        <LinkButton href="/admin/events/new"><CalendarPlus className="h-4 w-4" />Create event</LinkButton>
      </div>
      <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7" aria-label="Filter events">
        <Input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Search title" aria-label="Search title" className="lg:col-span-2" />
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">Any status</option>{EVENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
        <Select name="family" defaultValue={family ?? ""} aria-label="Family"><option value="">Any family</option>{EVENT_FAMILIES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</Select>
        <Select name="type" defaultValue={sp.type ?? ""} aria-label="Type">
          <option value="">Any type</option>
          {typeOptions.map((f) => <optgroup key={f.key} label={f.label}>{f.types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}</optgroup>)}
        </Select>
        {categories.length > 0 && (
          <Select name="categoryId" defaultValue={sp.categoryId ?? ""} aria-label="Brand type">
            <option value="">Any brand type</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <Select name="tag" defaultValue={sp.tag ?? ""} aria-label="Tag">
          <option value="">Any tag</option>
          {sp.tag && !tags.some((t) => t.tag.toLowerCase() === tag) && <option value={sp.tag}>{sp.tag}</option>}
          {tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}
        </Select>
        <Select name="campusId" defaultValue={sp.campusId ?? ""} aria-label="Campus"><option value="">Any campus</option>{tenant.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <div className="flex gap-2">
          <Button type="submit" variant="outline" className="flex-1">Filter</Button>
          {Object.values(sp).some(Boolean) && <Link href="/admin/events" className="inline-flex h-10 items-center px-2 text-sm text-muted hover:text-fg">Reset</Link>}
        </div>
      </form>
      <Card>
        {events.length ? (
          <Table>
            <thead><tr><Th>Event</Th><Th>Type</Th><Th>Tags</Th><Th>Where</Th><Th>When</Th><Th>Regs</Th><Th>Status</Th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-bg">
                  <Td><Link href={`/admin/events/${e.id}`} className="font-medium hover:text-primary">{e.title}</Link></Td>
                  <Td>
                    <Badge tone={e.category ? "highlight" : "primary"}>{eventLabel(e)}</Badge>
                    <span className="mt-1 block text-xs text-muted">{familyLabel(eventFamily(e))}</span>
                  </Td>
                  <Td>
                    {e.tags?.length ? (
                      <span className="flex max-w-[14rem] flex-wrap gap-1">
                        {e.tags.slice(0, 3).map((t) => (
                          <Link key={t} href={`/admin/events?tag=${encodeURIComponent(t)}`} className="rounded-full bg-bg px-2 py-0.5 text-xs text-fg ring-1 ring-inset ring-border hover:text-primary">{t}</Link>
                        ))}
                        {e.tags.length > 3 && <span className="text-xs text-muted" title={e.tags.slice(3).join(", ")}>+{e.tags.length - 3}</span>}
                      </span>
                    ) : <span className="text-muted">—</span>}
                  </Td>
                  <Td className="text-muted">{e.scope === "CENTRAL" ? "Central" : eventCampuses(e).map((c) => c.code || c.name).join(", ")} · {humanize(e.mode)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtRange(e.startsAt, e.endsAt)}</Td>
                  <Td className="tabular-nums">{eventCount(e, "registrations") ?? "—"}</Td>
                  <Td>
                    <StatusBadge status={e.status} />
                    {e.approvalStatus && e.approvalStatus !== "APPROVED" && (
                      <Badge tone={e.approvalStatus === "PENDING" ? "amber" : e.approvalStatus === "REJECTED" ? "red" : "gray"} className="ml-1">
                        {{ DRAFT: "Not submitted", PENDING: "Awaiting review", REJECTED: "Changes requested" }[e.approvalStatus]}
                      </Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6"><EmptyState title="No events found" action={<LinkButton href="/admin/events/new" size="sm">Create event</LinkButton>} /></div>
        )}
      </Card>
    </div>
  );
}
