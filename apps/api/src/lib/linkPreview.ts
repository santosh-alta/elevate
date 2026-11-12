import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Reads a public web page and pulls what it says about itself (Open Graph / Twitter tags, and an Event in
 * JSON-LD when the page has one), to pre-fill an outside event. Only public internet addresses are fetched:
 * private, local and cloud-metadata addresses are refused, also after redirects.
 */
export type LinkPreview = {
  url: string; title?: string; summary?: string; imageUrl?: string; siteName?: string; organizer?: string;
  startsAt?: string; endsAt?: string; location?: string; mode?: "ONLINE" | "OFFLINE" | "HYBRID";
};

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80")) return true;
    const v4 = x.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return v4 ? privateIp(v4[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(u: URL): Promise<void> {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) links");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("That link can't be read");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("That link can't be read");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("That link can't be read");
}

async function fetchPage(start: string): Promise<{ url: string; html: string }> {
  let url = new URL(start);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CampusEventsCalendar/1.0)", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { url = new URL(res.headers.get("location")!, url); continue; }
    if (!res.ok) throw new Error(`The page answered ${res.status}`);
    if (!/html/i.test(res.headers.get("content-type") ?? "")) throw new Error("That link isn't a web page");
    // Read at most 1.5 MB.
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 1_500_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); size += value.length;
    }
    void reader.cancel().catch(() => {});
    return { url: url.toString(), html: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error("Too many redirects");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function meta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content?.trim()) return decode(content);
  }
  return undefined;
}

type Ld = Record<string, unknown>;
function findEvent(node: unknown): Ld | undefined {
  if (Array.isArray(node)) { for (const n of node) { const f = findEvent(n); if (f) return f; } return undefined; }
  if (!node || typeof node !== "object") return undefined;
  const o = node as Ld;
  const t = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
  if (t.some((x) => /Event|Hackathon/i.test(x)) && o.startDate) return o;
  return findEvent(o["@graph"]);
}
const str = (v: unknown): string | undefined => (typeof v === "string" ? decode(v) : Array.isArray(v) ? str(v[0]) : v && typeof v === "object" ? str((v as Ld).url ?? (v as Ld).name) : undefined);
const iso = (v: unknown) => { const d = typeof v === "string" ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined; };

export async function readLinkPreview(link: string): Promise<LinkPreview> {
  const { url, html } = await fetchPage(link);
  const abs = (v?: string) => { try { return v ? new URL(v, url).toString() : undefined; } catch { return undefined; } };
  const out: LinkPreview = {
    url,
    title: meta(html, ["og:title", "twitter:title"]) ?? (html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)![1]) : undefined),
    summary: meta(html, ["og:description", "twitter:description", "description"]),
    imageUrl: abs(meta(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"])),
    siteName: meta(html, ["og:site_name", "application-name"]),
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let ev: Ld | undefined;
    try { ev = findEvent(JSON.parse(m[1].trim())); } catch { continue; }
    if (!ev) continue;
    out.title = str(ev.name) ?? out.title;
    out.summary = str(ev.description) ?? out.summary;
    out.imageUrl = abs(str(ev.image)) ?? out.imageUrl;
    out.startsAt = iso(ev.startDate);
    out.endsAt = iso(ev.endDate);
    out.organizer = str((ev.organizer as Ld | undefined)?.name ?? ev.organizer);
    const loc = ([] as unknown[]).concat(ev.location ?? []) as Ld[];
    const virtual = loc.some((l) => /Virtual/i.test(String(l?.["@type"]))) || /Online/i.test(String(ev.eventAttendanceMode ?? ""));
    const place = loc.find((l) => !/Virtual/i.test(String(l?.["@type"])));
    const addr = place?.address as Ld | string | undefined;
    out.location = typeof addr === "string" ? decode(addr) : str(addr?.addressLocality) ?? str(place?.name);
    out.mode = virtual && out.location ? "HYBRID" : virtual ? "ONLINE" : out.location ? "OFFLINE" : undefined;
    break;
  }
  if (out.title && out.siteName && out.title.endsWith(` | ${out.siteName}`)) out.title = out.title.slice(0, -(out.siteName.length + 3));
  if (out.summary && out.summary.length > 600) out.summary = `${out.summary.slice(0, 597).replace(/\s+\S*$/, "")}…`;
  return out;
}
