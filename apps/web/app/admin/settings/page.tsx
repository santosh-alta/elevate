import { CheckCircle2, Clock } from "lucide-react";
import { ROLES } from "@elevate/shared";
import { apiList } from "@/lib/api";
import { getMe, isBrandAdmin } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { fmtDateTime, humanize } from "@/lib/format";
import type { Campus, Domain, Membership } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Select, Table, Tabs, Td, Th } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { ApiForm } from "@/components/client/api-form";
import { CopyButton } from "@/components/client/misc";
import { ThemeEditor } from "./theme-editor";

export const metadata = { title: "Brand settings" };

const TABS = [
  { key: "theme", label: "Theme" },
  { key: "campuses", label: "Campuses" },
  { key: "members", label: "Team & roles" },
  { key: "domains", label: "Custom domains" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "theme" } = await searchParams;
  const tenant = await requireTenant();
  const me = await getMe();
  const active = TABS.some((t) => t.key === tab) ? tab : "theme";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Brand settings</h1>
        <p className="text-sm text-muted">How {tenant.name} looks and who runs it. Changes apply to the web and mobile apps.</p>
      </div>
      {!isBrandAdmin(me) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Only brand admins can change these settings.</p>}
      <Tabs tabs={TABS} active={active} baseHref="/admin/settings" />
      {active === "theme" && <ThemeEditor tenant={tenant} />}
      {active === "campuses" && <Campuses />}
      {active === "members" && <Members campuses={tenant.campuses} />}
      {active === "domains" && <Domains />}
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
            <thead><tr><Th>Name</Th><Th>Role</Th><Th>Campus</Th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <Td><p className="font-medium">{m.user?.name}</p><p className="text-xs text-muted">{m.user?.email}</p></Td>
                  <Td><Badge tone="primary">{humanize(m.role)}</Badge></Td>
                  <Td className="text-muted">{m.campus?.name ?? campuses.find((c) => c.id === m.campusId)?.name ?? "All"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No staff yet" description="Add admins, event managers, volunteers and judges." /></div>}
      </Card>
      <Card className="h-fit">
        <CardHeader title="Add team member" description="They sign in with this email" />
        <CardBody>
          <ApiForm path="/admin/members" className="space-y-3">
            <Input name="email" type="email" required placeholder="name@college.edu" />
            <Input name="name" required placeholder="Full name" />
            <Select name="role" defaultValue="EVENT_MANAGER">{ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</Select>
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
      )) : <EmptyState title="No custom domains" description="Until you add one, your site is served on the default Elevate subdomain." />}
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
