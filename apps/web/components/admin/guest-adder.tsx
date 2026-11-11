"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { GUEST_ROLES } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { Button, Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { humanize } from "@/lib/format";
import type { GuestProfile } from "@/lib/types";

/** Add a guest to an event: pick from the brand's guest library, or create a new guest (also saved to the library). */
export function GuestAdder({ eventId, staff }: { eventId: string; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"library" | "new">("library");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GuestProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("SPEAKER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "library") return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const d = await callApi<GuestProfile[] | { items?: GuestProfile[] }>("GET", `/guest-profiles?q=${encodeURIComponent(q)}`);
        setResults(Array.isArray(d) ? d : d?.items ?? []);
      } catch { setResults([]); } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  async function add(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const g = await callApi<{ id?: string }>("POST", `/events/${eventId}/guests`, body);
      router.push(g?.id ? `?tab=guests&guest=${g.id}` : "?tab=guests");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add guest");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader title="Add a guest" />
      <div className="flex gap-1 border-b border-border px-5 pt-2 text-sm">
        {(["library", "new"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn("border-b-2 px-2 py-2 font-medium", mode === m ? "border-primary text-primary" : "border-transparent text-muted")}>
            {m === "library" ? "From guest library" : "New guest"}
          </button>
        ))}
      </div>
      <CardBody className="space-y-3">
        <Field label="Role at this event">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>{GUEST_ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</Select>
        </Field>
        {mode === "library" ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, company, expertise" className="pl-9" aria-label="Search guest library" />
            </div>
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {results.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-bg">
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{p.name.slice(0, 1)}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted">{p.affiliation === "ALTA" ? "ALTA faculty · " : "External · "}{[p.designation, p.organization].filter(Boolean).join(", ")}{typeof p.appearances === "number" ? ` · ${p.appearances} events` : ""}</p>
                  </div>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => add({ profileId: p.id, role })}>Add</Button>
                </li>
              ))}
              {!loading && !results.length && <li className="py-4 text-center text-sm text-muted">{q ? "No match. Add them as a new guest." : "The guest library is empty."}</li>}
              {loading && <li className="py-4 text-center text-sm text-muted">Searching…</li>}
            </ul>
          </>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const body: Record<string, unknown> = { role, status: "PROPOSED" };
              for (const k of ["name", "email", "phone", "designation", "organization", "linkedinUrl", "talkTitle", "hostUserId"]) {
                const v = ((fd.get(k) as string) ?? "").trim();
                if (v) body[k] = v;
              }
              void add(body);
            }}
          >
            <Field label="Name"><Input name="name" required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Designation"><Input name="designation" placeholder="Founder" /></Field>
              <Field label="Organisation"><Input name="organization" /></Field>
              <Field label="Email" hint="Needed for the invite"><Input name="email" type="email" /></Field>
              <Field label="Phone"><Input name="phone" /></Field>
            </div>
            <Field label="LinkedIn"><Input name="linkedinUrl" type="url" /></Field>
            <Field label="Talk title"><Input name="talkTitle" /></Field>
            <Field label="Host (point of contact)">
              <Select name="hostUserId" defaultValue=""><option value="">Assign later</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
            </Field>
            <Button type="submit" className="w-full" disabled={busy}><UserPlus className="h-4 w-4" />Add guest</Button>
            <p className="text-xs text-muted">Send the invite to let them fill their own photo, bio and travel details.</p>
          </form>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardBody>
    </Card>
  );
}
