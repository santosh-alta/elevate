"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { callApi } from "@/components/client/api";
import { UploadField } from "@/components/client/uploader";
import { Button, Card, CardBody, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { toLocalInput } from "@/lib/format";
import type { Guest } from "@/lib/types";

export function GuestPortalForm({ token, guest, alreadySubmitted, locked = false }: { token: string; guest: Guest; alreadySubmitted: boolean; locked?: boolean }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!alreadySubmitted && !locked);

  if (done || !editing) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <p className="text-xl font-semibold">Thank you{guest.name ? `, ${guest.name.split(" ")[0]}` : ""}!</p>
          <p className="max-w-md text-sm text-muted">
            {locked ? "This event has finished, so details can no longer be changed here. Thank you for being part of it." : "We have your details. Our team will be in touch about the final schedule. You can come back to this link any time to update them."}
          </p>
          {!locked && <Button variant="outline" size="sm" onClick={() => { setDone(false); setEditing(true); }}>Update my details</Button>}
        </CardBody>
      </Card>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const s = (k: string) => ((fd.get(k) as string | null) ?? "").trim() || undefined;
        const d = (k: string) => (s(k) ? new Date(s(k)!).toISOString() : undefined);
        const consent = fd.get("consentRecording");
        const body = {
          name: s("name"), designation: s("designation"), organization: s("organization"), bio: s("bio"),
          linkedinUrl: s("linkedinUrl"), photoUrl: s("photoUrl"), phone: s("phone"),
          talkTitle: s("talkTitle"), talkAbstract: s("talkAbstract"),
          arrivalAt: d("arrivalAt"), departureAt: d("departureAt"), dietary: s("dietary"), avRequirements: s("avRequirements"),
          consentRecording: consent === "yes" ? true : consent === "no" ? false : undefined,
        };
        setBusy(true); setError(null);
        try {
          await callApi("PUT", `/guest-portal/${encodeURIComponent(token)}`, body);
          setDone(true); setEditing(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Card>
        <CardHeader title="About you" description="This appears on the event page and your speaker profile." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Photo" className="sm:col-span-2" hint="A clear, square headshot works best.">
            <UploadField name="photoUrl" defaultValue={guest.photoUrl} path={`/guest-portal/${encodeURIComponent(token)}/upload`} />
          </Field>
          <Field label="Full name"><Input name="name" required defaultValue={guest.name} /></Field>
          <Field label="Phone"><Input name="phone" type="tel" defaultValue={guest.phone ?? ""} /></Field>
          <Field label="Designation"><Input name="designation" defaultValue={guest.designation ?? ""} placeholder="Founder & CEO" /></Field>
          <Field label="Organisation"><Input name="organization" defaultValue={guest.organization ?? ""} /></Field>
          <Field label="LinkedIn profile" className="sm:col-span-2"><Input name="linkedinUrl" type="url" defaultValue={guest.linkedinUrl ?? ""} placeholder="https://www.linkedin.com/in/…" /></Field>
          <Field label="Short bio" className="sm:col-span-2" hint="80–150 words, written in third person.">
            <Textarea name="bio" rows={5} defaultValue={guest.bio ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your session" />
        <CardBody className="grid gap-4">
          <Field label="Talk title"><Input name="talkTitle" defaultValue={guest.talkTitle ?? ""} placeholder="From campus idea to funded startup" /></Field>
          <Field label="What will students learn?"><Textarea name="talkAbstract" rows={4} defaultValue={guest.talkAbstract ?? ""} /></Field>
          <Field label="AV / setup needs" hint="Projector, mic, clicker, internet, video playback…"><Input name="avRequirements" defaultValue={guest.avRequirements ?? ""} /></Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">May we photograph and record your session and share it on our channels?</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="consentRecording" value="yes" defaultChecked={guest.consentRecording === true} className="accent-[rgb(var(--primary))]" />Yes</label>
              <label className="flex items-center gap-2"><input type="radio" name="consentRecording" value="no" defaultChecked={guest.consentRecording === false} className="accent-[rgb(var(--primary))]" />No</label>
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Travel & visit" description="Helps us arrange pickup, stay and meals." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Arrival"><Input name="arrivalAt" type="datetime-local" defaultValue={toLocalInput(guest.arrivalAt)} /></Field>
          <Field label="Departure"><Input name="departureAt" type="datetime-local" defaultValue={toLocalInput(guest.departureAt)} /></Field>
          <Field label="Dietary preferences" className="sm:col-span-2"><Input name="dietary" defaultValue={guest.dietary ?? ""} placeholder="Vegetarian, Jain, allergies…" /></Field>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end"><Button type="submit" size="lg" disabled={busy}>{busy ? "Saving…" : "Submit my details"}</Button></div>
    </form>
  );
}
