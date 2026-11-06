"use client";

import { useState } from "react";
import { PhotoUploader } from "@/components/client/uploader";
import { Field, Input, Select } from "@/components/ui";
import { humanize } from "@/lib/format";

const KINDS = ["PHOTO", "GUEST_PHOTO", "POSTER", "VIDEO", "DECK", "REPORT", "OTHER"];

/** Uploader with a "what is this" picker; files become media items on the event. */
export function MediaUploadPanel({ eventId }: { eventId: string }) {
  const [kind, setKind] = useState("PHOTO");
  const [caption, setCaption] = useState("");
  const accept = kind === "VIDEO" ? "video/*" : ["DECK", "REPORT", "OTHER"].includes(kind) ? "application/pdf,image/*" : "image/*";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select></Field>
        <Field label="Caption (optional, applies to this batch)"><Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Keynote by Asha Rao" /></Field>
      </div>
      <PhotoUploader
        fields={{ eventId, kind, caption: caption || undefined }}
        accept={accept}
        label={kind === "PHOTO" ? "Drop event photos here or click to choose" : `Drop ${humanize(kind).toLowerCase()} files here`}
        hint={kind === "VIDEO" ? "Short clips only, up to 15 MB. Put long videos on Drive or YouTube and add the link below." : "Up to 15 MB each"}
      />
    </div>
  );
}
