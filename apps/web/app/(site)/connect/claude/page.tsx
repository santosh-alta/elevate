import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarCheck, CheckCircle2, ClipboardList, MessageSquareText, Plug, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { apiFetch, apiGet } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { ROLE_LABELS } from "@elevate/shared";
import { PageHero } from "@/components/page-hero";
import { Card } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";
import { CopyButton } from "@/components/client/misc";
import { BrandLogo } from "@/components/brand-logo";
import { ConsentButtons } from "./consent-buttons";

export const metadata: Metadata = { title: "Connect Claude", robots: { index: false } };

type Request = { appName: string; returnHost: string; user: { name: string; email: string }; role: keyof typeof ROLE_LABELS | null };
type Connections = { mcpUrl: string; connections: { id: string; appName: string; connectedAt: string; lastUsedAt: string | null }[] };

const when = (d: string) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

/**
 * Connect Claude (or another AI assistant) to this events platform.
 *  - ?req=… : the approval step of the sign-in (Allow / Cancel), reached from the assistant.
 *  - otherwise: how to connect, the connector address, and connected apps with Disconnect.
 */
export default async function ConnectClaudePage({ searchParams }: { searchParams: Promise<{ req?: string }> }) {
  const { req } = await searchParams;
  const tenant = await requireTenant();
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/connect/claude${req ? `?req=${encodeURIComponent(req)}` : ""}`)}`);
  const short = tenant.name.split(" ")[0];

  if (req) {
    const r = await apiFetch<Request>(`/oauth/requests/${encodeURIComponent(req)}`);
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
        <Card className="w-full overflow-hidden">
          <div className="flex items-center justify-center gap-4 bg-hero-bg px-6 py-8 text-hero-fg">
            <BrandLogo tenant={tenant} variant="dark" size={34} />
            <Plug className="h-5 w-5 opacity-70" />
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><Sparkles className="h-6 w-6" /></span>
          </div>
          <div className="space-y-5 p-6">
            {!r.ok || !r.data ? (
              <>
                <h1 className="font-heading text-xl font-bold">This link has expired</h1>
                <p className="text-sm text-muted">{r.error ?? "Start connecting again from Claude."}</p>
              </>
            ) : (
              <>
                <div>
                  <h1 className="font-heading text-xl font-bold leading-snug">Allow <span className="text-primary">{r.data.appName}</span> to use {short} Events as you?</h1>
                  <p className="mt-1 text-sm text-muted">Signed in as {r.data.user.name} ({r.data.user.email}){r.data.role ? ` · ${ROLE_LABELS[r.data.role]}` : ""}</p>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />See and manage everything your role allows: events, registrations, tasks, reports and settings.</li>
                  <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Act on your behalf when you ask it to, like creating an event or checking someone in.</li>
                  <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />It can never do more than you can, and you can disconnect it at any time on this page.</li>
                </ul>
                <ConsentButtons req={req} />
                <p className="text-center text-xs text-muted">You&apos;ll return to {r.data.returnHost}.</p>
              </>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const data = await apiGet<Connections>("/me/connections");
  const url = data?.mcpUrl ?? "";
  return (
    <>
      <PageHero eyebrow="AI assistant" title="Connect Claude" description={`Ask Claude about ${short} events in plain words, and let it do the work: create events, check registrations, tick off tasks, compare campuses.`} size="sm" className="pb-10" />
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16">
        <Card className="relative -mt-8 space-y-4 p-6">
          <h2 className="font-heading text-lg font-bold">Your connector address</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded-xl bg-bg px-4 py-3 text-sm">{url}</code>
            <CopyButton text={url} label="Copy address" />
          </div>
          <ol className="grid gap-4 text-sm sm:grid-cols-3">
            <li className="rounded-xl border border-border p-4">
              <p className="font-semibold">Claude on the web or app</p>
              <p className="mt-1 text-muted">Settings → Connectors → <b>Add custom connector</b>. Name it “{short} Events”, paste the address and click Add. Then click <b>Connect</b> and sign in here.</p>
            </li>
            <li className="rounded-xl border border-border p-4">
              <p className="font-semibold">Claude Desktop</p>
              <p className="mt-1 text-muted">Same as the web: Settings → Connectors → Add custom connector, paste the address, then Connect.</p>
            </li>
            <li className="rounded-xl border border-border p-4">
              <p className="font-semibold">Claude Code</p>
              <code className="mt-2 block break-all rounded-lg bg-bg px-2 py-1.5 text-xs">claude mcp add --transport http {short.toLowerCase()}-events {url}</code>
              <p className="mt-1 text-muted">Then run /mcp and choose Authenticate.</p>
            </li>
          </ol>
          <p className="flex items-start gap-2 rounded-xl bg-bg px-4 py-3 text-xs text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            Claude works as you, with your role. Students who connect see only what students can see. Before it emails people, publishes or deletes something, Claude asks you first.
          </p>
        </Card>

        <Card className="p-6">
          <h2 className="font-heading text-lg font-bold">Things to ask</h2>
          <ul className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {[
              [CalendarCheck, "Which events are coming up this month, and how many have registered for each?"],
              [ClipboardList, "What tasks are overdue for the hackathon? Mark the poster task as done."],
              [Trophy, "Which campus had the best turnout last quarter? Compare with the one before."],
              [MessageSquareText, "Summarise the feedback for last week's workshop: what worked and what to fix."],
              [Sparkles, "Create a guest lecture on AI agents at Pune on 5 Dec, 3–5 pm, as a draft."],
              [Plug, "Add the Smart India Hackathon to the calendar as an outside event."],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Plug;
              return <li key={i} className="flex gap-3 rounded-xl bg-bg p-3"><I className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span>“{text as string}”</span></li>;
            })}
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="font-heading text-lg font-bold">Connected apps</h2>
          {!data?.connections.length ? (
            <p className="mt-2 text-sm text-muted">Nothing connected yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.connections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{c.appName}</p>
                    <p className="text-xs text-muted">Connected {when(c.connectedAt)}{c.lastUsedAt ? ` · last used ${when(c.lastUsedAt)}` : ""}</p>
                  </div>
                  <ApiButton method="DELETE" path={`/me/connections/${c.id}`} variant="outline" size="sm" confirm={`Disconnect ${c.appName}? It will need to sign in again.`}>Disconnect</ApiButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
