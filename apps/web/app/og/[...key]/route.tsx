import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { resolveTheme } from "@elevate/shared";
import { apiListPublicFor, apiPublicFor } from "@/lib/api";
import { campusTitle, eventLabel } from "@/lib/format";
import { originFor } from "@/lib/brand-meta";
import { getHost, tenantForHost } from "@/lib/tenant";
import { absoluteUrl } from "@/lib/theme";
import type { CampusProfile, CampusSummary, ElevateEvent, Guest, Tenant } from "@/lib/types";

/**
 * Share previews (WhatsApp, LinkedIn, X, Slack): a branded 1200×630 card per page.
 *   /og/home  /og/events  /og/winners  /og/campuses  /og/verify
 *   /og/event/<slug>  /og/campus/<code>  /og/speaker/<id>
 * Only public data is drawn; nothing comes from the query string.
 */
export const revalidate = 600;

const W = 1200;
const H = 630;
const TZ = "Asia/Kolkata";

type Fonts = { name: string; data: ArrayBuffer; weight: 500 | 800; style: "normal" }[];
const fontCache = new Map<string, Promise<Fonts>>();

/** Brand font from Google Fonts as TTF (the renderer can't read WOFF2). Falls back to the built-in font. */
function loadFonts(family: string): Promise<Fonts> {
  if (!fontCache.has(family)) {
    fontCache.set(family, (async () => {
      const out: Fonts = [];
      for (const weight of [500, 800] as const) {
        try {
          const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`, { signal: AbortSignal.timeout(4000) })).text();
          const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
          if (url) out.push({ name: "Brand", data: await (await fetch(url, { signal: AbortSignal.timeout(4000) })).arrayBuffer(), weight, style: "normal" });
        } catch { /* use the default font */ }
      }
      if (out.length < 2) fontCache.delete(family);
      return out;
    })());
  }
  return fontCache.get(family)!;
}

/** An image as a data URL the renderer can draw (WebP and big photos become JPEG). Undefined on any failure, so the card still renders. */
async function drawable(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !type.startsWith("image/")) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 12_000_000) return undefined;
    if (/^image\/(png|jpe?g|gif|svg\+xml)$/.test(type) && buf.length < 3_000_000) return `data:${type};base64,${buf.toString("base64")}`;
    // WebP/AVIF/large photos: shrink to a JPEG the renderer can draw.
    const sharp = (await import("sharp")).default;
    const jpg = await sharp(buf).rotate().resize(900, 900, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch {
    return undefined;
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const titleSize = (s: string, wide: boolean) => (s.length > 60 ? (wide ? 54 : 46) : s.length > 34 ? (wide ? 64 : 54) : wide ? 76 : 64);
const day = (d: string, o: Intl.DateTimeFormatOptions) => new Date(d).toLocaleString("en-IN", { timeZone: TZ, ...o });

function when(e: Pick<ElevateEvent, "startsAt" | "endsAt">): string {
  const sameDay = day(e.startsAt, { dateStyle: "short" }) === day(e.endsAt, { dateStyle: "short" });
  const start = day(e.startsAt, { weekday: "short", day: "numeric", month: "short" });
  if (!sameDay) return `${day(e.startsAt, { day: "numeric", month: "short" })} – ${day(e.endsAt, { day: "numeric", month: "short", year: "numeric" })}`;
  return `${start} · ${day(e.startsAt, { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase()}`;
}

const ICONS = {
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  pin: "M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20",
  ticket: "M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3zM14 6v12",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  trophy: "M6 9H4a2 2 0 0 1 0-4h2M18 9h2a2 2 0 0 0 0-4h-2M6 3h12v6a6 6 0 0 1-12 0zM12 15v4M8 21h8",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
} as const;

function Icon({ d, color, size = 26 }: { d: keyof typeof ICONS; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[d]} />
    </svg>
  );
}

type Card = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  chips?: { icon: keyof typeof ICONS; text: string }[];
  image?: string;
  imageRound?: boolean;
  list?: { title: string; meta: string }[];
  cta?: string;
};

function render(t: Tenant, host: string, logo: string | undefined, c: Card, fonts: Fonts, cacheControl: string) {
  const th = resolveTheme(t.theme);
  const { heroBg, heroFg, accent } = th.colors;
  const cta = th.colors.secondary ?? accent;
  const ctaFg = th.colors.secondaryFg ?? "#ffffff";
  const [g1, g2] = th.gradient ?? [accent, cta];
  const side = c.image ? "image" : c.list?.length ? "list" : null;
  const tagline = th.tagline ?? (t.settings.tagline as string | undefined);

  let sidePanel: ReactNode = null;
  if (side === "image" && c.imageRound) {
    sidePanel = (
      <div style={{ display: "flex", width: 340, height: 340, borderRadius: 340, padding: 8, backgroundImage: `linear-gradient(135deg, ${g1}, ${g2})` }}>
        <img src={c.image} width={324} height={324} style={{ borderRadius: 324, objectFit: "cover" }} />
      </div>
    );
  } else if (side === "image") {
    sidePanel = (
      <div style={{ display: "flex", borderRadius: 28, padding: 6, backgroundImage: `linear-gradient(135deg, ${g1}, ${g2})`, boxShadow: "0 30px 60px rgba(0,0,0,0.35)" }}>
        <img src={c.image} width={440} height={330} style={{ borderRadius: 22, objectFit: "cover" }} />
      </div>
    );
  } else if (side === "list") {
    sidePanel = (
      <div style={{ display: "flex", flexDirection: "column", width: 430, gap: 14 }}>
        {c.list!.slice(0, 3).map((x, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", padding: "18px 22px", borderRadius: 18, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderLeft: `6px solid ${i % 2 ? g2 : g1}` }}>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2, color: i % 2 ? g2 : g1, textTransform: "uppercase" }}>{x.meta}</span>
            <span style={{ fontSize: 25, fontWeight: 800, color: heroFg, marginTop: 4, lineHeight: 1.2 }}>{clip(x.title, 48)}</span>
          </div>
        ))}
      </div>
    );
  }

  const wide = !sidePanel;
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: heroBg, color: heroFg, fontFamily: fonts.length ? "Brand" : undefined, position: "relative" }}>
        {/* soft brand glows */}
        <div style={{ position: "absolute", display: "flex", right: -180, top: -220, width: 620, height: 620, borderRadius: 620, backgroundImage: `radial-gradient(circle, ${g1}55 0%, ${g1}00 70%)` }} />
        <div style={{ position: "absolute", display: "flex", left: -200, bottom: -260, width: 640, height: 640, borderRadius: 640, backgroundImage: `radial-gradient(circle, ${g2}40 0%, ${g2}00 70%)` }} />

        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "52px 64px 0 64px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {logo ? <img src={logo} height={66} style={{ objectFit: "contain" }} /> : <span style={{ fontSize: 34, fontWeight: 800 }}>{t.name}</span>}
            <span style={{ display: "flex", fontSize: 17, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", padding: "9px 18px", borderRadius: 999, border: `2px solid ${accent}`, color: accent }}>{clip(c.eyebrow, 32)}</span>
          </div>

          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 48 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ fontSize: titleSize(c.title, wide), fontWeight: 800, lineHeight: 1.08, letterSpacing: -0.5 }}>{clip(c.title, wide ? 90 : 72)}</span>
              {c.subtitle && <span style={{ fontSize: 27, fontWeight: 500, lineHeight: 1.35, marginTop: 18, opacity: 0.82 }}>{clip(c.subtitle, wide ? 150 : 110)}</span>}
              {!!c.chips?.length && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
                  {c.chips.map((ch, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderRadius: 14, background: "rgba(255,255,255,0.09)", fontSize: 23, fontWeight: 500 }}>
                      <Icon d={ch.icon} color={accent} />
                      <span>{clip(ch.text, 40)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {sidePanel}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 64px 30px 64px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 24, fontWeight: 800 }}>{host}</span>
            {tagline && <span style={{ fontSize: 18, fontWeight: 500, opacity: 0.65, marginTop: 2 }}>{tagline}</span>}
          </div>
          {c.cta && <span style={{ display: "flex", fontSize: 24, fontWeight: 800, padding: "14px 30px", borderRadius: 999, background: cta, color: ctaFg }}>{c.cta} →</span>}
        </div>
        <div style={{ display: "flex", height: 12, backgroundImage: `linear-gradient(90deg, ${g1}, ${g2})` }} />
      </div>
    ),
    { width: W, height: H, fonts: fonts.length ? fonts : undefined, headers: { "Cache-Control": cacheControl } },
  );
}

function upcomingList(events: ElevateEvent[]) {
  return events.slice(0, 3).map((e) => ({ title: e.title, meta: `${eventLabel(e)} · ${day(e.startsAt, { day: "numeric", month: "short" })}` }));
}

async function cardFor(t: Tenant, host: string, origin: string, key: string[]): Promise<Card | null> {
  const [kind, raw] = key;
  const id = raw ? encodeURIComponent(decodeURIComponent(raw)) : "";
  const short = t.name.split(" ")[0];
  switch (kind) {
    case "home": {
      const up = await apiListPublicFor<ElevateEvent>(host, "/events?upcoming=1", 300);
      return {
        eyebrow: `${short} Events`,
        title: up.length ? "Hackathons, workshops & talks. Join the next one." : `Events at ${t.name}`,
        subtitle: "Register in seconds, check in with a QR code and get your certificate on LinkedIn.",
        chips: up.length ? [{ icon: "calendar", text: `${up.length} upcoming event${up.length === 1 ? "" : "s"}` }] : undefined,
        list: upcomingList(up),
        cta: "Explore events",
      };
    }
    case "events": {
      const up = await apiListPublicFor<ElevateEvent>(host, "/events?upcoming=1", 300);
      return { eyebrow: "All events", title: up.length ? `${up.length} upcoming event${up.length === 1 ? "" : "s"} at ${short}` : `Events at ${t.name}`, subtitle: "Hackathons, workshops, talks and competitions across every campus.", list: upcomingList(up), cta: "Browse events" };
    }
    case "winners":
      return { eyebrow: "Hall of fame", title: "Meet the winners", subtitle: `Champions from hackathons and competitions across ${t.name}.`, chips: [{ icon: "trophy", text: "Hackathons · Competitions" }], cta: "See winners" };
    case "campuses": {
      const cs = await apiListPublicFor<CampusSummary>(host, "/campuses", 600);
      return {
        eyebrow: "Campuses", title: cs.length ? `${cs.length} campuses, one community` : "Our campuses",
        subtitle: cs.length ? clip(cs.map((c) => c.city ?? c.name).filter((v, i, a) => a.indexOf(v) === i).join(" · "), 140) : undefined,
        cta: "Find your campus",
      };
    }
    case "verify":
      return { eyebrow: "Certificates", title: "Verify a certificate", subtitle: `Check that a certificate issued by ${t.name} is genuine.`, chips: [{ icon: "shield", text: "Scan the QR or enter the serial" }] };
    case "event": {
      if (!id) return null;
      const e = await apiPublicFor<ElevateEvent>(host, `/events/${id}`, 300);
      if (!e?.title) return null;
      const chips: Card["chips"] = [{ icon: "calendar", text: when(e) }];
      if (e.mode === "ONLINE") chips.push({ icon: "globe", text: "Online" });
      else if (e.venue) chips.push({ icon: "pin", text: e.mode === "HYBRID" ? `${e.venue} + online` : e.venue });
      const amount = e.fee?.currentAmount ?? e.feeAmount ?? 0;
      chips.push({ icon: "ticket", text: amount > 0 ? `₹${amount.toLocaleString("en-IN")}${e.fee?.feeType === "PER_TEAM" || e.feeType === "PER_TEAM" ? " per team" : ""}` : "Free" });
      const past = new Date(e.endsAt) < new Date();
      return {
        eyebrow: eventLabel(e), title: e.title, subtitle: e.tagline ?? undefined, chips,
        image: await drawable(absoluteUrl(e.coverImageUrl, origin)),
        cta: past ? "See highlights" : "Register now",
      };
    }
    case "campus": {
      if (!id) return null;
      const c = await apiPublicFor<CampusProfile>(host, `/campuses/${id}`, 600);
      if (!c?.name) return null;
      const chips: Card["chips"] = [];
      if (c.stats?.eventsHeld) chips.push({ icon: "calendar", text: `${c.stats.eventsHeld} events held` });
      if (c.stats?.participants) chips.push({ icon: "users", text: `${c.stats.participants.toLocaleString("en-IN")} participants` });
      if (!chips.length && c.city) chips.push({ icon: "pin", text: c.city });
      return { eyebrow: "Campus", title: campusTitle(c, short), subtitle: c.name, chips, image: await drawable(absoluteUrl(c.photoUrl, origin)), cta: "See events" };
    }
    case "speaker": {
      if (!id) return null;
      const d = await apiPublicFor<Partial<Guest> & { guest?: Guest }>(host, `/speakers/${id}`, 600);
      const g = { ...(d?.guest ?? {}), ...(d ?? {}) } as Partial<Guest>;
      if (!g.name) return null;
      const role = [g.designation, g.organization].filter(Boolean).join(", ");
      return { eyebrow: `Speaker at ${short}`, title: g.name, subtitle: role || undefined, image: await drawable(absoluteUrl(g.photoUrl, origin)), imageRound: true };
    }
    default:
      return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key ?? [];
  const host = await getHost();
  const found = await tenantForHost(host);
  if (!found) return new Response("Not found", { status: 404 });
  const t = { ...found, name: found.name.replace(/\s+/g, " ").trim() };
  const origin = originFor(host);
  const th = resolveTheme(t.theme);
  const [card, logo, fonts] = await Promise.all([
    cardFor(t, host, origin, key).catch(() => null),
    drawable(absoluteUrl(th.logoDarkUrl ?? th.logoUrl, origin)),
    loadFonts(th.headingFont ?? th.font ?? "Inter"),
  ]);
  const fallback: Card = { eyebrow: `${t.name.split(" ")[0]} Events`, title: `Events at ${t.name}`, subtitle: "Hackathons, workshops, talks and more.", cta: "Explore events" };
  // A stand-in card (page not found, or the API briefly unreachable) is kept only a minute so the real one replaces it.
  const cache = card ? "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" : "public, max-age=60, s-maxage=60";
  return render(t, host, logo, card ?? fallback, fonts, cache);
}
