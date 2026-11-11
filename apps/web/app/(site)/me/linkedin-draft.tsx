"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Linkedin, Loader2, Sparkles } from "lucide-react";
import { callApi } from "@/components/client/api";
import { Badge, Button, Card, Input, StatusBadge, Textarea } from "@/components/ui";
import type { LinkedInPost } from "@/lib/types";
import { useAiUsage, usageLabel } from "@/components/client/ai-assist";

const STYLES = [
  { key: "story", label: "Storytelling" },
  { key: "punchy", label: "Short & punchy" },
  { key: "proud", label: "Proud moment" },
  { key: "professional", label: "Professional" },
] as const;

export function LinkedInDraft({ post, brand }: { post: LinkedInPost; brand: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(post.draft);
  const [postUrl, setPostUrl] = useState(post.postUrl ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const usage = useAiUsage();
  const aiOut = !!usage && usage.remaining <= 0;

  async function aiRewrite(style: string) {
    setAiBusy(style); setMsg(null);
    try {
      const r = await callApi<{ draft: string }>("POST", `/linkedin/${post.id}/ai`, { style });
      setDraft(r.draft);
      setMsg("New version ready. Fill in any [brackets] with your own words, then share.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setAiBusy(null);
    }
  }

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await callApi<{ featured?: boolean }>("PATCH", `/linkedin/${post.id}`, body);
      setMsg(r.featured ? `${ok} Your post now shows on the event page.` : ok);
      router.refresh();
    }
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
      {!posted && usage?.enabled && (
        <div className="mb-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-accent/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />Write it with AI</p>
          <p className="mt-0.5 text-xs text-muted">Get a ready-to-post version that stands out. Pick a style:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s.key} type="button" disabled={!!aiBusy || aiOut} onClick={() => void aiRewrite(s.key)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium transition hover:border-primary/50 hover:text-primary disabled:opacity-50"
              >{aiBusy === s.key && <Loader2 className="h-3 w-3 animate-spin" />}{s.label}</button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">{aiBusy ? "Writing… (10–20 seconds)" : usageLabel(usage)}</p>
        </div>
      )}
      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} disabled={posted} />
      {!posted && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(draft).then(() => setCopied(true)).catch(() => {});
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
      {!posted && (
        <p className="mt-2 text-xs text-muted">
          {copied ? "Copied! If LinkedIn opens with an empty box, just paste. " : "Tip: "}
          On LinkedIn, type <strong>@{brand}</strong> and pick the page to tag it, and add your certificate or a photo from the event for more reach.
        </p>
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
