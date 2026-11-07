// Lightweight renderer for the sanitised HTML the web rich-text editor produces (headings, bold, italic,
// underline, lists, links, inline code, code blocks, quotes, images, tables). Pure JS — no WebView or
// native deps. Plain-text values (no tags) render as paragraphs, with "- " / "• " lines as bullets.
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import React from "react";
import { Image, Text, View } from "react-native";
import { useTheme } from "./session";
import { withAlpha } from "./theme";

interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  href?: string;
}

type BlockKind = "p" | "h" | "li" | "quote" | "pre" | "img" | "row" | "hr";

interface Block {
  kind: BlockKind;
  level?: number;
  /** List marker: number for ordered lists, null for bullets */
  marker?: number | null;
  depth?: number;
  header?: boolean;
  inlines: Inline[];
  src?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : undefined;
}

export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i.test(s);
}

function parsePlain(text: string): Block[] {
  const blocks: Block[] = [];
  for (const para of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = para.split("\n");
    let buf: string[] = [];
    const flush = () => {
      if (buf.length) blocks.push({ kind: "p", inlines: [{ text: buf.join("\n") }] });
      buf = [];
    };
    for (const line of lines) {
      const m = /^\s*(?:[-•*]|(\d+)[.)])\s+(.*)$/.exec(line);
      if (m) {
        flush();
        blocks.push({ kind: "li", marker: m[1] ? Number(m[1]) : null, depth: 0, inlines: [{ text: m[2] }] });
      } else buf.push(line);
    }
    flush();
  }
  return blocks.filter((b) => b.inlines.some((i) => i.text.trim()));
}

const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "tr", "section", "article", "figure", "figcaption", "header", "footer"]);

export function parseHtml(html: string): Block[] {
  if (!looksLikeHtml(html)) return parsePlain(decode(html));
  const blocks: Block[] = [];
  const lists: { ordered: boolean; n: number }[] = [];
  const style = { bold: 0, italic: 0, underline: 0, code: 0 };
  const hrefs: string[] = [];
  let quote = 0;
  let pre = 0;
  let cur: Block | null = null;
  let rowHeader = false;

  const flush = () => {
    if (cur && (cur.inlines.some((i) => i.text.trim()) || cur.kind === "img" || cur.kind === "hr")) {
      // trim leading/trailing whitespace of the block
      if (cur.kind !== "pre" && cur.inlines.length) {
        cur.inlines[0].text = cur.inlines[0].text.replace(/^\s+/, "");
        const last = cur.inlines[cur.inlines.length - 1];
        last.text = last.text.replace(/\s+$/, "");
      }
      blocks.push(cur);
    }
    cur = null;
  };
  const ensure = () => {
    if (!cur) cur = { kind: pre ? "pre" : quote ? "quote" : "p", inlines: [] };
    return cur;
  };
  const push = (text: string) => {
    const b = ensure();
    b.inlines.push({
      text,
      bold: style.bold > 0 || undefined,
      italic: style.italic > 0 || undefined,
      underline: style.underline > 0 || undefined,
      code: style.code > 0 || undefined,
      href: hrefs[hrefs.length - 1] || undefined,
    });
  };

  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) {
      let text = decode(m[5]);
      if (!pre) text = text.replace(/\s+/g, " ");
      if (!pre && !cur && !text.trim()) continue;
      push(text);
      continue;
    }
    if (!m[2]) continue; // comment
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? "";
    if (tag === "script" || tag === "style") continue;

    switch (tag) {
      case "b":
      case "strong":
        style.bold += closing ? -1 : 1;
        break;
      case "i":
      case "em":
        style.italic += closing ? -1 : 1;
        break;
      case "u":
        style.underline += closing ? -1 : 1;
        break;
      case "code":
        if (!pre) style.code += closing ? -1 : 1;
        break;
      case "a":
        if (closing) hrefs.pop();
        else hrefs.push(attr(attrs, "href") ?? "");
        break;
      case "br":
        push("\n");
        break;
      case "hr":
        flush();
        blocks.push({ kind: "hr", inlines: [] });
        break;
      case "img": {
        const src = attr(attrs, "src");
        if (src && /^https?:\/\//.test(src)) {
          flush();
          blocks.push({ kind: "img", src, inlines: [{ text: attr(attrs, "alt") ?? "" }] });
        }
        break;
      }
      case "ul":
      case "ol":
        flush();
        if (closing) lists.pop();
        else lists.push({ ordered: tag === "ol", n: Number(attr(attrs, "start") ?? 1) - 1 });
        break;
      case "blockquote":
        flush();
        quote += closing ? -1 : 1;
        break;
      case "pre":
        flush();
        pre += closing ? -1 : 1;
        break;
      case "table":
      case "thead":
      case "tbody":
        flush();
        break;
      case "th":
      case "td":
        if (!closing) {
          if (!cur || cur.kind !== "row") {
            flush();
            cur = { kind: "row", header: tag === "th" || rowHeader, inlines: [] };
          } else if (cur.inlines.some((i) => i.text.trim())) push("  |  ");
        }
        break;
      default:
        if (BLOCK_TAGS.has(tag)) {
          // Editors emit <li><p>text</p></li>: keep the list item open for its first paragraph.
          const c = cur as Block | null;
          if (!closing && (tag === "p" || tag === "div") && c?.kind === "li" && !c.inlines.some((i) => i.text.trim())) break;
          flush();
          if (closing) break;
          if (/^h[1-6]$/.test(tag)) cur = { kind: "h", level: Number(tag[1]), inlines: [] };
          else if (tag === "li") {
            const l = lists[lists.length - 1];
            if (l) l.n += 1;
            cur = { kind: "li", marker: l?.ordered ? l.n : null, depth: Math.max(0, lists.length - 1), inlines: [] };
          } else if (tag === "tr") {
            rowHeader = false;
            cur = { kind: "row", inlines: [] };
          }
        }
    }
  }
  flush();
  return blocks;
}

function openLink(href: string) {
  if (/^https?:\/\//.test(href)) WebBrowser.openBrowserAsync(href).catch(() => Linking.openURL(href));
  else if (/^(mailto|tel):/.test(href)) Linking.openURL(href).catch(() => undefined);
}

export function HtmlContent({ html, compact }: { html?: string | null; compact?: boolean }) {
  const t = useTheme();
  if (!html || !html.trim()) return null;
  const blocks = parseHtml(html);
  const base = { color: t.colors.fg, fontSize: compact ? 14 : 15, lineHeight: compact ? 20 : 22 };

  const renderInlines = (inlines: Inline[]) =>
    inlines.map((i, k) => (
      <Text
        key={k}
        onPress={i.href ? () => openLink(i.href!) : undefined}
        style={[
          i.bold && { fontWeight: "700" as const },
          i.italic && { fontStyle: "italic" as const },
          i.underline && { textDecorationLine: "underline" as const },
          i.code && { fontFamily: "monospace", backgroundColor: withAlpha(t.colors.muted, 0.12) },
          i.href ? { color: t.colors.primary, textDecorationLine: "underline" as const } : null,
        ]}
      >
        {i.text}
      </Text>
    ));

  return (
    <View style={{ gap: compact ? 6 : 10 }}>
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "h": {
            const size = b.level === 1 ? 22 : b.level === 2 ? 19 : b.level === 3 ? 17 : 15;
            return (
              <Text key={idx} style={[base, { fontSize: size, lineHeight: size * 1.3, fontWeight: "800", marginTop: idx ? 4 : 0 }]}>
                {renderInlines(b.inlines)}
              </Text>
            );
          }
          case "li":
            return (
              <View key={idx} style={{ flexDirection: "row", paddingLeft: (b.depth ?? 0) * 16, gap: 8 }}>
                <Text style={[base, { minWidth: 16, color: t.colors.muted }]}>{b.marker != null ? `${b.marker}.` : "•"}</Text>
                <Text style={[base, { flex: 1 }]}>{renderInlines(b.inlines)}</Text>
              </View>
            );
          case "quote":
            return (
              <View key={idx} style={{ borderLeftWidth: 3, borderLeftColor: withAlpha(t.colors.primary, 0.5), paddingLeft: 12 }}>
                <Text style={[base, { fontStyle: "italic", color: t.colors.muted }]}>{renderInlines(b.inlines)}</Text>
              </View>
            );
          case "pre":
            return (
              <View key={idx} style={{ backgroundColor: withAlpha(t.colors.muted, 0.1), borderRadius: 8, padding: 10 }}>
                <Text style={[base, { fontFamily: "monospace", fontSize: 13, lineHeight: 18 }]}>{b.inlines.map((i) => i.text).join("")}</Text>
              </View>
            );
          case "img":
            return (
              <Image
                key={idx}
                source={{ uri: b.src }}
                accessibilityLabel={b.inlines[0]?.text || undefined}
                style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: withAlpha(t.colors.muted, 0.08) }}
                resizeMode="contain"
              />
            );
          case "row":
            return (
              <Text
                key={idx}
                style={[base, { fontSize: 14, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: t.colors.border }, b.header && { fontWeight: "700" }]}
              >
                {renderInlines(b.inlines)}
              </Text>
            );
          case "hr":
            return <View key={idx} style={{ height: 1, backgroundColor: t.colors.border, marginVertical: 4 }} />;
          default:
            return (
              <Text key={idx} style={base}>
                {renderInlines(b.inlines)}
              </Text>
            );
        }
      })}
    </View>
  );
}

/** Plain-text preview of an HTML value (for one-line summaries). */
export function htmlToText(html?: string | null): string {
  if (!html) return "";
  return parseHtml(html)
    .map((b) => b.inlines.map((i) => i.text).join(""))
    .join("\n")
    .trim();
}
