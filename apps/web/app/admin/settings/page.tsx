import { CheckCircle2, Clock } from "lucide-react";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@elevate/shared";
import { ApiSelect } from "@/components/client/api-select";
import { TeamToggles } from "@/components/admin/team-toggles";
import { apiGet, apiList } from "@/lib/api";
import { isBrandAdmin, requireStaffPage } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { fmtDateTime, humanize } from "@/lib/format";
import type { Campus, Domain, Membership } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Select, Table, Tabs, Td, Th } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { CopyButton } from "@/components/client/misc";
import { ThemeEditor } from "./theme-editor";
import { CertificateDesignEditor, type DesignMap } from "@/components/admin/certificate-design-editor";
import { TicketDesignEditor, type TicketDesign } from "@/components/admin/ticket-design-editor";
import { EventTypesManager } from "./event-types-manager";
import { StudentsSettings } from "./students-settings";
import { NotificationSettings } from "./notification-settings";
import { getEventTypes, getTags } from "@/lib/catalog";
import { EventIcon } from "@/components/event-icon";
import { SUGGESTED_TAGS } from "@elevate/shared";

export const metadata = { title: "Brand settings" };

const TABS = [
  { key: "theme", label: "Theme" },
  { key: "contact", label: "Contact & certificates" },
  { key: "types", label: "Event types" },
  { key: "campuses", label: "Campuses" },
  { key: "students", label: "Students" },
  { key: "notifications", label: "Notifications" },
  { key: "members", label: "Team & roles" },
  { key: "domains", label: "Custom domains" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "theme" } = await searchParams;
  const tenant = await requireTenant();
  const me = await requireStaffPage();
  const active = TABS.some((t) => t.key === tab) ? tab : "theme";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Brand settings</h1>
        <p className="text-sm text-muted">How {tenant.name} looks and who runs it. Changes apply to the web and mobile apps.</p>
      </div>
      {!isBrandAdmin(me) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Only brand admins can change these settings.</p>}
      <Tabs tabs={TABS} active={active} baseHref="/admin/settings" />
      {active === "theme" && <ThemeEditor tenant={tenant} />}
      {active === "contact" && (
        <div className="space-y-6">
          <ContactSettings settings={tenant.settings as Record<string, unknown>} />
          <Card>
            <CardHeader title="Certificate design" description="The look for every event's certificates. An event can still use its own design (event → Certificates)." />
            <CardBody>
              <CertificateDesignEditor initial={(await apiGet<DesignMap>("/certificate-designs")) ?? {}} canEdit={isBrandAdmin(me)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Ticket design" description="The look of every event's tickets. An event can still use its own design (event → Registrations)." />
            <CardBody>
              <TicketDesignEditor initial={(await apiGet<{ design: TicketDesign | null }>("/ticket-design"))?.design ?? null} canEdit={isBrandAdmin(me)} />
            </CardBody>
          </Card>
        </div>
      )}
      {active === "types" && <EventTypes canEdit={isBrandAdmin(me)} />}
      {active === "campuses" && <Campuses />}
      {active === "students" && <StudentsSettings campuses={tenant.campuses} canEdit={isBrandAdmin(me)} />}
      {active === "notifications" && <NotificationSettings canEdit={isBrandAdmin(me)} />}
      {active === "members" && <Members campuses={tenant.campuses} />}
      {active === "domains" && <Domains />}
    </div>
  );
}

async function EventTypes({ canEdit }: { canEdit: boolean }) {
  const [families, tags] = await Promise.all([getEventTypes(true), getTags(true)]);
  const suggestions = [...tags.map((t) => t.tag), ...SUGGESTED_TAGS];
  return (
    <div className="space-y-8">
      <EventTypesManager families={families} canEdit={canEdit} tagSuggestions={suggestions} />
      <section aria-labelledby="builtin-types">
        <h2 id="builtin-types" className="font-heading text-lg font-bold">Built-in types</h2>
        <p className="mb-4 text-sm text-muted">Every brand gets these, grouped into five families. They set the default modules, checklist and page template.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {families.map((f) => (
            <Card key={f.key}>
              <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><EventIcon name={f.icon} className="h-5 w-5" /></span>
                <div>
                  <h3 className="font-semibold">{f.label}</h3>
                  <p className="text-xs text-muted">{f.description}</p>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {f.types.map((t) => (
                  <li key={t.type} className="px-5 py-2.5">
                    <p className="text-sm font-medium">{t.label}</p>
                    {t.hint && <p className="text-xs text-muted">{t.hint}</p>}
                  </li>
                ))}
                {f.custom.filter((c) => !c.archived && !c.archivedAt).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <span className="text-sm font-medium">{c.name}</span>
                    <Badge tone="highlight">Your brand</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

async function Campuses() {
  const campuses = await apiList<Campus>("/admin/campuses");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        {campuses.length ? (
          <Table>
            <thead><tr><Th>Campus</Th><Th>Code</Th><Th>City</Th></tr></thead>
            <tbody>{campuses.map((c) => <tr key={c.id}><Td className="font-medium">{c.name}</Td><Td className="font-mono text-xs">{c.code}</Td><Td className="text-muted">{c.city ?? "—"}</Td></tr>)}</tbody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No campuses yet" /></div>}
      </Card>
      <Card className="h-fit">
        <CardHeader title="Add campus" />
        <CardBody>
          <ApiForm path="/admin/campuses" className="space-y-3">
            <Input name="name" required placeholder="Campus name" />
            <Input name="code" required placeholder="Short code, e.g. BLR" className="uppercase" />
            <Input name="city" placeholder="City" />
            <Input name="address" placeholder="Address" />
            <Button type="submit" className="w-full">Add campus</Button>
          </ApiForm>
        </CardBody>
      </Card>
    </div>
  );
}

async function Members({ campuses }: { campuses: Campus[] }) {
  const members = (await apiList<Membership>("/admin/members")).filter((m) => m.role !== "STUDENT");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        {members.length ? (
          <Table>
            <thead><tr><Th>Name</Th><Th>Role</Th><Th>Teams</Th><Th>Campus</Th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <Td><p className="font-medium">{m.user?.name}</p><p className="text-xs text-muted">{m.user?.email}</p></Td>
                  <Td>
                    <ApiSelect path={`/admin/members/${m.id}`} field="role" value={m.role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
                  </Td>
                  <Td><TeamToggles membershipId={m.id} teams={m.teams ?? []} leadTeams={m.leadTeams ?? []} /></Td>
                  <Td className="text-muted">{m.campus?.name ?? campuses.find((c) => c.id === m.campusId)?.name ?? "All"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No staff yet" description="Add admins, moderators, organizers, volunteers and judges." /></div>}
        <div className="border-t border-border p-5">
          <p className="text-sm font-medium">Teams</p>
          <p className="mt-1 text-sm text-muted">
            Checklist tasks belong to the event owner, Operations or Social media. People in a team see its tasks under <span className="font-medium">My tasks</span> for every event and can tick them off; posts need the post link as proof. Click the crown to make someone the team&apos;s lead: leads are copied on every email about their team&apos;s tasks.
          </p>
          <p className="mt-4 text-sm font-medium">What each role can do</p>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r}><dt className="inline font-medium">{ROLE_LABELS[r]}: </dt><dd className="inline text-muted">{ROLE_DESCRIPTIONS[r]}</dd></div>
            ))}
          </dl>
        </div>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Add or change a person's role" description="Use the email they sign in with. If they already have an account, their role is updated." />
        <CardBody>
          <ApiForm path="/admin/members" className="space-y-3">
            <Input name="email" type="email" required placeholder="name@college.edu" />
            <Input name="name" required placeholder="Full name" />
            <Select name="role" defaultValue="ORGANIZER">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
            <Select name="campusId" defaultValue=""><option value="">All campuses</option>{campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Button type="submit" className="w-full">Add member</Button>
          </ApiForm>
        </CardBody>
      </Card>
    </div>
  );
}

async function Domains() {
  const domains = await apiList<Domain>("/admin/domains");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Connect your own domain" description="e.g. event.sunstone.in — your site will look fully like your own, with free SSL." />
        <CardBody>
          <ApiForm path="/admin/domains" className="flex max-w-lg gap-2">
            <Input name="hostname" required placeholder="event.yourbrand.com" pattern="^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$" />
            <Button type="submit">Add domain</Button>
          </ApiForm>
        </CardBody>
      </Card>
      {domains.length ? domains.map((d) => (
        <Card key={d.id}>
          <CardHeader
            title={<span className="font-mono">{d.hostname}</span>}
            description={d.verifiedAt ? `Verified ${fmtDateTime(d.verifiedAt)}` : "Add these DNS records at your domain provider, then click Verify."}
            action={d.verifiedAt
              ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />Verified{d.isPrimary ? " · primary" : ""}</Badge>
              : <div className="flex items-center gap-2"><Badge tone="amber"><Clock className="h-3 w-3" />Pending</Badge><ApiButton path={`/admin/domains/${d.id}/verify`} size="sm">Verify</ApiButton></div>}
          />
          <Table>
            <thead><tr><Th>Type</Th><Th>Name / host</Th><Th>Value</Th><Th /></tr></thead>
            <tbody>
              <DnsRow type="CNAME" name={d.hostname} value={d.cnameTarget ?? "domains.elevate.app"} />
              <DnsRow type="TXT" name={`_elevate.${d.hostname}`} value={d.verificationToken} />
            </tbody>
          </Table>
        </Card>
      )) : <EmptyState title="No custom domains" description="Until you add one, your site is served on its temporary address." />}
    </div>
  );
}

function DnsRow({ type, name, value }: { type: string; name: string; value: string }) {
  return (
    <tr>
      <Td><Badge>{type}</Badge></Td>
      <Td className="font-mono text-xs">{name}</Td>
      <Td className="break-all font-mono text-xs">{value}</Td>
      <Td><CopyButton text={value} /></Td>
    </tr>
  );
}

function ContactSettings({ settings }: { settings: Record<string, unknown> }) {
  const str = (k: string) => (typeof settings[k] === "string" ? (settings[k] as string) : "");
  const social = (settings.social ?? {}) as Record<string, string>;
  const signatories = (Array.isArray(settings.signatories) ? settings.signatories : []) as { name?: string; title?: string }[];
  return (
    <Card>
      <CardHeader title="Contact details and certificate signatories" description="Shown in email footers, the website footer and on certificates." />
      <CardBody>
        <ApiForm method="PATCH" path="/admin/theme" resetOnSuccess={false} successMessage="Saved" className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="font-medium">Website</span><Input name="settings.website" type="url" defaultValue={str("website")} placeholder="https://www.yourbrand.com" /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Contact email</span><Input name="settings.supportEmail" type="email" defaultValue={str("supportEmail")} /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">Phone</span><Input name="settings.phone" defaultValue={str("phone")} placeholder="+91-…" /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Address</span><Input name="settings.address" defaultValue={str("address")} /></label>
          {(["linkedin", "instagram", "youtube", "facebook", "x"] as const).map((k) => (
            <label key={k} className="space-y-1 text-sm"><span className="font-medium">{k === "x" ? "X (Twitter)" : humanize(k)} link</span><Input name={`settings.social.${k}`} type="url" defaultValue={social[k] ?? ""} placeholder="https://" /></label>
          ))}
          <div className="space-y-3 sm:col-span-2">
            <p className="text-sm font-medium">Certificate signatories <span className="font-normal text-muted">(up to 3; leave a row empty to skip it)</span></p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                <Input name={`settings.signatories.${i}.name`} defaultValue={signatories[i]?.name ?? ""} placeholder="Name, e.g. Ashish Munjal" aria-label={`Signatory ${i + 1} name`} />
                <Input name={`settings.signatories.${i}.title`} defaultValue={signatories[i]?.title ?? ""} placeholder="Title, e.g. Founder" aria-label={`Signatory ${i + 1} title`} />
              </div>
            ))}
          </div>
          <div className="sm:col-span-2"><Button type="submit">Save</Button></div>
        </ApiForm>
      </CardBody>
    </Card>
  );
}
