"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { GUEST_ROLES } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { uploadFile } from "@/components/client/upload";
import { UploadField } from "@/components/client/uploader";
import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { GUEST_STATUS_LIST, humanize, toLocalInput } from "@/lib/format";
import type { Guest, GuestDocument } from "@/lib/types";


const PAYMENT = ["NOT_APPLICABLE", "PENDING", "PAID"];
const DOC_KINDS = ["ID_PROOF", "INVOICE", "PRESENTATION", "TRAVEL", "CONTRACT", "OTHER"];

/** Full guest file editor: profile, session, logistics, payment & courtesy, documents. */
export function GuestEditor({ guest, eventId, staff }: { guest: Guest; eventId: string; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [docs, setDocs] = useState<GuestDocument[]>(Array.isArray(guest.documents) ? guest.documents : []);
  const [docKind, setDocKind] = useState("OTHER");
  const [docBusy, setDocBusy] = useState<number | null>(null);

  async function saveDocs(next: GuestDocument[]) {
    setDocs(next);
    await callApi("PATCH", `/guests/${guest.id}`, { documents: next });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const s = (k: string) => { const v = ((fd.get(k) as string | null) ?? "").trim(); return v === "" ? null : v; };
          const d = (k: string) => (s(k) ? new Date(s(k)!).toISOString() : null);
          const consent = s("consentRecording");
          const body = {
            name: s("name") ?? guest.name, email: s("email"), phone: s("phone"), designation: s("designation"),
            organization: s("organization"), linkedinUrl: s("linkedinUrl"), photoUrl: s("photoUrl"), bio: s("bio"),
            role: s("role") ?? "SPEAKER", status: s("status") ?? guest.status, isPublic: fd.get("isPublic") === "on",
            talkTitle: s("talkTitle"), talkAbstract: s("talkAbstract"), sessionAt: d("sessionAt"),
            hostUserId: s("hostUserId"), arrivalAt: d("arrivalAt"), departureAt: d("departureAt"),
            travelNotes: s("travelNotes"), stayDetails: s("stayDetails"), dietary: s("dietary"), avRequirements: s("avRequirements"),
            consentRecording: consent === "yes" ? true : consent === "no" ? false : null,
            honorarium: s("honorarium") ? Number(s("honorarium")) : null, paymentStatus: s("paymentStatus"),
            invoiceUrl: s("invoiceUrl"), mementoGiven: fd.get("mementoGiven") === "on",
            syncProfile: fd.get("syncProfile") === "on",
          };
          setBusy(true); setMsg(null);
          try {
            await callApi("PATCH", `/guests/${guest.id}`, body);
            setMsg({ ok: true, text: "Saved." });
            router.refresh();
          } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Card>
          <CardHeader title="Profile" description="Public fields appear on the event page and speaker page." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Photo" className="sm:col-span-2"><UploadField name="photoUrl" defaultValue={guest.photoUrl} fields={{ eventId, kind: "GUEST_PHOTO" }} /></Field>
            <Field label="Name"><Input name="name" required defaultValue={guest.name} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role"><Select name="role" defaultValue={guest.role ?? "SPEAKER"}>{GUEST_ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</Select></Field>
              <Field label="Status"><Select name="status" defaultValue={guest.status ?? "PROPOSED"}>{GUEST_STATUS_LIST.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</Select></Field>
            </div>
            <Field label="Designation"><Input name="designation" defaultValue={guest.designation ?? ""} /></Field>
            <Field label="Organisation"><Input name="organization" defaultValue={guest.organization ?? ""} /></Field>
            <Field label="Email"><Input name="email" type="email" defaultValue={guest.email ?? ""} /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={guest.phone ?? ""} /></Field>
            <Field label="LinkedIn" className="sm:col-span-2"><Input name="linkedinUrl" type="url" defaultValue={guest.linkedinUrl ?? ""} /></Field>
            <Field label="Bio" className="sm:col-span-2"><Textarea name="bio" rows={5} defaultValue={guest.bio ?? ""} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublic" defaultChecked={guest.isPublic !== false} className="accent-[rgb(var(--primary))]" />Show on the public event page</label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Session" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Talk title" className="sm:col-span-2"><Input name="talkTitle" defaultValue={guest.talkTitle ?? ""} /></Field>
            <Field label="Abstract" className="sm:col-span-2"><Textarea name="talkAbstract" rows={4} defaultValue={guest.talkAbstract ?? ""} /></Field>
            <Field label="Session time"><Input type="datetime-local" name="sessionAt" defaultValue={toLocalInput(guest.sessionAt)} /></Field>
            <Field label="Recording / photo consent">
              <Select name="consentRecording" defaultValue={guest.consentRecording === true ? "yes" : guest.consentRecording === false ? "no" : ""}>
                <option value="">Not asked yet</option><option value="yes">Yes, consented</option><option value="no">No</option>
              </Select>
            </Field>
            <Field label="AV / setup needs" className="sm:col-span-2"><Input name="avRequirements" defaultValue={guest.avRequirements ?? ""} /></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Logistics" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Host (point of contact)" className="sm:col-span-2" hint="Our team member who looks after this guest.">
              <Select name="hostUserId" defaultValue={guest.hostUserId ?? ""}>
                <option value="">Not assigned</option>
                {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Arrival"><Input type="datetime-local" name="arrivalAt" defaultValue={toLocalInput(guest.arrivalAt)} /></Field>
            <Field label="Departure"><Input type="datetime-local" name="departureAt" defaultValue={toLocalInput(guest.departureAt)} /></Field>
            <Field label="Travel (flight / train / pickup)" className="sm:col-span-2"><Textarea name="travelNotes" rows={2} defaultValue={guest.travelNotes ?? ""} /></Field>
            <Field label="Stay" className="sm:col-span-2"><Input name="stayDetails" defaultValue={guest.stayDetails ?? ""} placeholder="Hotel, check-in/out" /></Field>
            <Field label="Dietary" className="sm:col-span-2"><Input name="dietary" defaultValue={guest.dietary ?? ""} /></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Payment & courtesy" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Honorarium (₹)"><Input type="number" min={0} step="1" name="honorarium" defaultValue={guest.honorarium != null ? String(guest.honorarium) : ""} /></Field>
            <Field label="Payment status">
              <Select name="paymentStatus" defaultValue={guest.paymentStatus ?? ""}>
                <option value="">—</option>{PAYMENT.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}
              </Select>
            </Field>
            <Field label="Invoice" className="sm:col-span-2"><UploadField name="invoiceUrl" defaultValue={guest.invoiceUrl} accept="application/pdf,image/*" image={false} fields={{ eventId }} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mementoGiven" defaultChecked={guest.mementoGiven} className="accent-[rgb(var(--primary))]" />Memento given</label>
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {guest.profileId && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="syncProfile" className="accent-[rgb(var(--primary))]" />Also update the guest library profile</label>}
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save guest file"}</Button>
        </div>
      </form>

      <Card>
        <CardHeader title="Documents" description="ID proof, invoice, presentation, travel tickets" />
        <ul className="divide-y divide-border">
          {docs.map((doc, i) => (
            <li key={`${doc.url}-${i}`} className="flex items-center gap-3 px-5 py-3 text-sm">
              <FileText className="h-4 w-4 text-muted" />
              <a href={doc.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-primary">{doc.name}</a>
              {doc.kind && <span className="text-xs text-muted">{humanize(doc.kind)}</span>}
              <button type="button" aria-label={`Remove ${doc.name}`} className={buttonClass("ghost", "sm")} onClick={() => saveDocs(docs.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {!docs.length && <li className="px-5 py-4 text-sm text-muted">No documents yet.</li>}
        </ul>
        <CardBody className="flex flex-wrap items-center gap-2 border-t border-border">
          <Select value={docKind} onChange={(e) => setDocKind(e.target.value)} className="w-44">{DOC_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select>
          <label className={buttonClass("outline", "md", "cursor-pointer")}>
            {docBusy !== null ? `Uploading ${docBusy}%` : "Upload document"}
            <input
              type="file" className="hidden" accept="application/pdf,image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setDocBusy(0);
                try {
                  const r = await uploadFile("/uploads", f, { eventId }, setDocBusy);
                  await saveDocs([...docs, { name: f.name, url: r.url, kind: docKind }]);
                } catch (err) {
                  setMsg({ ok: false, text: err instanceof Error ? err.message : "Upload failed" });
                } finally {
                  setDocBusy(null);
                }
              }}
            />
          </label>
        </CardBody>
      </Card>
    </div>
  );
}
