import { ExternalLink, Instagram, Linkedin, Youtube } from "lucide-react";
import { socialEmbed } from "@elevate/shared";

export interface Highlight { id: string; platform: string; url: string | null; authorName?: string | null }

const LABEL: Record<string, { name: string; icon: typeof Linkedin; tone: string }> = {
  LINKEDIN: { name: "LinkedIn", icon: Linkedin, tone: "text-[#0A66C2]" },
  INSTAGRAM: { name: "Instagram", icon: Instagram, tone: "text-[#E1306C]" },
  YOUTUBE: { name: "YouTube", icon: Youtube, tone: "text-[#FF0000]" },
};

/** "From the community": LinkedIn, Instagram and YouTube posts shown as live embedded previews. */
export function SocialEmbeds({ items }: { items: Highlight[] }) {
  const embeds = items.map((h) => ({ h, e: h.url ? socialEmbed(h.url) : null })).filter((x) => x.e);
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
      {embeds.map(({ h, e }) => {
        const meta = LABEL[e!.platform];
        const Icon = meta.icon;
        return (
          <figure key={h.id} className="break-inside-avoid overflow-hidden rounded-brand border border-border bg-card shadow-sm">
            <figcaption className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${meta.tone}`} />
                <span className="truncate font-medium">{h.authorName || meta.name}</span>
              </span>
              <a href={e!.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-muted hover:text-primary">
                Open <ExternalLink className="h-3 w-3" />
              </a>
            </figcaption>
            <iframe
              src={e!.embedUrl}
              title={`${meta.name} post${h.authorName ? ` by ${h.authorName}` : ""}`}
              loading="lazy"
              allow="encrypted-media; picture-in-picture; clipboard-write"
              allowFullScreen
              className={`block w-full border-0 bg-white ${e!.height ? "" : "aspect-video"}`}
              style={e!.height ? { height: e!.height } : undefined}
            />
          </figure>
        );
      })}
    </div>
  );
}
