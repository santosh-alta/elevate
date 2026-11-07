import { youTubeId } from "@elevate/shared";

/**
 * A YouTube video playing muted and looping behind a hero section, covering it edge to edge,
 * with a brand-coloured overlay so the text on top stays readable. Purely decorative: no controls,
 * not focusable, hidden for people who prefer reduced motion.
 */
export function HeroVideo({ url }: { url?: string | null }) {
  const id = youTubeId(url);
  if (!id) return null;
  const src = `https://www.youtube-nocookie.com/embed/${id}?${new URLSearchParams({
    autoplay: "1", mute: "1", loop: "1", playlist: id, controls: "0", playsinline: "1",
    rel: "0", modestbranding: "1", disablekb: "1", iv_load_policy: "3", fs: "0",
  })}`;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden [container-type:size] motion-reduce:hidden">
      <iframe
        src={src}
        title=""
        tabIndex={-1}
        allow="autoplay; encrypted-media; picture-in-picture"
        loading="eager"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0"
        style={{ width: "max(100cqw, 177.78cqh)", height: "max(100cqh, 56.25cqw)" }}
      />
      {/* Readability: darker on the left where the headline sits. */}
      <div className="absolute inset-0 bg-gradient-to-r from-hero-bg/95 via-hero-bg/80 to-hero-bg/55" />
    </div>
  );
}
