"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Instagram, Linkedin, Plus, Trash2, Youtube } from "lucide-react";
import { socialEmbed } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { Button, Input } from "@/components/ui";

type Item = { id: string; platform: string; url?: string | null; authorName?: string | null };
const ICON = { LINKEDIN: Linkedin, INSTAGRAM: Instagram, YOUTUBE: Youtube } as Record<string, typeof Linkedin>;

/** Admin: posts shown under "From the community" on the event page. */
export function HighlightsManager({ eventId, items }: { eventId: string; items: Item[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = url ? socialEmbed(url) : null;

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_200px_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          try {
            await callApi("POST", `/events/${eventId}/highlights`, { url: url.trim(), authorName: author.trim() || undefined });
            setUrl(""); setAuthor(""); router.refresh();
          } catch (err) { setError((err as Error).message); }
          finally { setBusy(false); }
        }}
      >
        <Input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a LinkedIn, Instagram or YouTube post link" />
        <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Posted by (optional)" maxLength={120} />
        <Button type="submit" disabled={busy || (!!url && !preview)}><Plus className="h-4 w-4" />{busy ? "Adding…" : "Add"}</Button>
      </form>
      {url && !preview && <p className="text-xs text-amber-700">That link can’t be shown as a preview. Use a public LinkedIn post, Instagram post or reel, or YouTube video link.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.length ? (
        <ul className="divide-y divide-border rounded-brand border border-border">
          {items.map((h) => {
            const Icon = ICON[h.platform] ?? Linkedin;
            return (
              <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{h.authorName || "Official post"}</p>
                  <a href={h.url ?? "#"} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted hover:text-primary">{h.url}</a>
                </div>
                <Button
                  size="sm" variant="ghost" aria-label="Remove from event page"
                  onClick={async () => {
                    if (!window.confirm("Remove this post from the event page?")) return;
                    await callApi("PATCH", `/social/${h.id}`, { featured: false });
                    router.refresh();
                  }}
                ><Trash2 className="h-4 w-4" /></Button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted">No posts yet. Add the event’s own posts, and great posts from participants and guests.</p>}
    </div>
  );
}
