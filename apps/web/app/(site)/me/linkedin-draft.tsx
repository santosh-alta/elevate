"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Linkedin } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Badge, Button, Card, Input, StatusBadge, Textarea } from "@/components/ui";
import type { LinkedInPost } from "@/lib/types";

export function LinkedInDraft({ post }: { post: LinkedInPost }) {
  const router = useRouter();
  const [draft, setDraft] = useState(post.draft);
  const [postUrl, setPostUrl] = useState(post.postUrl ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await callApi("PATCH", `/linkedin/${post.id}`, body); setMsg(ok); router.refresh(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  const posted = post.status === "POSTED";
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold">{post.event?.title ?? "Event"}</p>
        <div className="flex gap-2">{post.generatedBy === "ai" && <Badge tone="purple">AI draft</Badge>}<StatusBadge status={post.status} /></div>
      </div>
      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={7} disabled={posted} />
      {!posted && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(draft).catch(() => {});
              window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(draft)}`, "_blank", "noopener");
              if (draft !== post.draft) await patch({ draft, status: "EDITED" }, "Draft saved and copied.");
            }}
          >
            <Linkedin className="h-4 w-4" />Share on LinkedIn
          </Button>
          {draft !== post.draft && <Button size="sm" variant="outline" disabled={busy} onClick={() => patch({ draft, status: "EDITED" }, "Draft saved.")}>Save edits</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ status: "SKIPPED" }, "Skipped.")}>Skip</Button>
        </div>
      )}
      <form
        className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row"
        onSubmit={(e) => { e.preventDefault(); patch({ postUrl, status: "POSTED" }, "Marked as posted. 🎉"); }}
      >
        <Input type="url" required value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="Paste your LinkedIn post link" />
        <Button type="submit" variant={posted ? "outline" : "secondary"} disabled={busy}>{posted ? "Update link" : "I've posted it"}</Button>
      </form>
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
    </Card>
  );
}
