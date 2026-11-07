import { cn } from "./ui/cn";

// Allow-list sanitiser that REBUILDS the markup from tokens: only listed tags and attributes survive, attribute
// values are re-escaped, URLs are scheme-checked, and script/style-like elements are dropped with their content.
// The API already sanitises every HTML field on write (sanitize-html); this is the second layer on render.
// (isomorphic-dompurify needs jsdom, which cannot load on Node < 22.12, so it isn't used server-side.)
const ALLOWED: Record<string, string[]> = {
  p: [], br: [], h1: [], h2: [], h3: [], h4: [], strong: [], b: [], em: [], i: [], u: [], s: [], strike: [], del: [],
  code: [], pre: [], blockquote: [], ul: [], ol: ["start"], li: [], hr: [], span: [], div: [],
  a: ["href", "title"], img: ["src", "alt", "title", "width", "height"],
  table: [], thead: [], tbody: [], tfoot: [], tr: [], colgroup: [], col: ["span"],
  th: ["colspan", "rowspan", "colwidth"], td: ["colspan", "rowspan", "colwidth"],
};
const VOID = new Set(["br", "hr", "img", "col"]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "textarea", "select", "svg", "math", "title", "head"]);
const STYLE_OK = /^\s*((text-align|width|min-width)\s*:\s*[a-z0-9.%\s-]+;?\s*)+$/i;

/** True when the value looks like HTML (has at least one tag). */
export function isHtml(value: string): boolean {
  return /<([a-z][a-z0-9]*)\b[^>]*>/i.test(value);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeText(s: string): string {
  // Keep existing entities, neutralise any stray angle brackets.
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function decodeEntities(s: string): string {
  return s.replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&colon;/gi, ":").replace(/&tab;/gi, "\t").replace(/&newline;/gi, "\n")
    .replace(/&quot;/gi, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
}
function safeUrl(raw: string, kind: "href" | "src"): string | null {
  const v = decodeEntities(raw).replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  if (kind === "src") return /^(https?:\/\/|\/files\/|\/api\/proxy\/)/i.test(v) ? raw.trim() : null;
  if (/^(https?:|mailto:|tel:)/i.test(v) || /^(\/|#)/.test(v)) return raw.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? null : raw.trim(); // relative ok, any other scheme (javascript:, data:) dropped
}

/** Legacy plain-text descriptions: blank lines → paragraphs, single newlines → <br>. */
export function plainToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>?|<\?[^>]*>?|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function sanitize(html: string): string {
  let out = "";
  let last = 0;
  let dropping: string | null = null;
  const open: string[] = [];
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(html); m; m = TOKEN.exec(html)) {
    if (!dropping) out += escapeText(html.slice(last, m.index));
    last = TOKEN.lastIndex;
    const name = m[1]?.toLowerCase();
    if (!name) continue; // comment, doctype, CDATA, PI
    const closing = m[0].startsWith("</");
    if (dropping) { if (closing && name === dropping) dropping = null; continue; }
    if (DROP_WITH_CONTENT.has(name)) { if (!closing && !m[0].endsWith("/>")) dropping = name; continue; }
    const allowed = ALLOWED[name];
    if (!allowed) continue;
    if (closing) {
      const i = open.lastIndexOf(name);
      if (i >= 0) { for (let j = open.length - 1; j >= i; j--) out += `</${open[j]}>`; open.length = i; }
      continue;
    }
    let attrs = "";
    const rawAttrs = m[2] ?? "";
    ATTR.lastIndex = 0;
    for (let a = ATTR.exec(rawAttrs); a; a = ATTR.exec(rawAttrs)) {
      const an = a[1].toLowerCase();
      const av = a[2] ?? a[3] ?? a[4] ?? "";
      if (an === "style") { if (STYLE_OK.test(av)) attrs += ` style="${escapeHtml(av)}"`; continue; }
      if (!allowed.includes(an)) continue;
      if (an === "href" || an === "src") {
        const u = safeUrl(av, an);
        if (u === null) continue;
        attrs += ` ${an}="${escapeHtml(decodeEntities(u))}"`;
      } else if (["colspan", "rowspan", "start", "span", "width", "height"].includes(an)) {
        if (/^\d{1,4}$/.test(av)) attrs += ` ${an}="${av}"`;
      } else {
        attrs += ` ${an}="${escapeHtml(decodeEntities(av))}"`;
      }
    }
    if (name === "a" && attrs.includes("href=")) attrs += ' target="_blank" rel="noopener noreferrer nofollow"';
    if (name === "img") { if (!attrs.includes("src=")) continue; attrs += ' loading="lazy"'; }
    out += `<${name}${attrs}>`;
    if (!VOID.has(name)) open.push(name);
  }
  if (!dropping) out += escapeText(html.slice(last));
  for (let j = open.length - 1; j >= 0; j--) out += `</${open[j]}>`;
  return out;
}

/** Sanitised HTML for rendering (the API sanitises on write; we do it again on render). */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitize(isHtml(html) ? html : plainToHtml(html));
}

/** Strip tags for previews / meta descriptions. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

/** Renders admin-written rich text (or legacy plain text) with the brand's typography. */
export function RichText({ html, className, size = "base" }: { html: string | null | undefined; className?: string; size?: "sm" | "base" }) {
  const clean = sanitizeHtml(html);
  if (!clean) return null;
  return (
    <div
      className={cn("prose prose-brand max-w-none", size === "sm" && "prose-sm", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
