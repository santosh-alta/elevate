import sanitizeHtmlLib from "sanitize-html";

/**
 * Allow-list sanitiser for rich text written in the web editor (event description, page sections, problem statements).
 * Scripts, event handlers, styles, iframes and javascript: URLs are dropped. Images only from http(s) or our own /files.
 */
const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre", "blockquote",
    "ul", "ol", "li", "a", "img", "table", "thead", "tbody", "tr", "th", "td", "hr", "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs.href && { href: attribs.href }),
        ...(attribs.target === "_blank" && { target: "_blank" }),
        rel: "noopener noreferrer",
      },
    }),
  },
  exclusiveFilter: (frame) => {
    if (frame.tag !== "img") return false;
    const src = frame.attribs.src ?? "";
    // http(s) URLs, or relative links to our own stored files.
    return !(/^https?:\/\//i.test(src) || /^\/(v1\/)?files\//.test(src));
  },
};

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  // Relative /files images are allowed: sanitize-html's scheme check treats them as relative URLs (no scheme).
  return sanitizeHtmlLib(input, OPTIONS).trim();
}

/** Sanitises `html` in each page section and keeps only the known keys. */
export function sanitizeSections<T extends { id: string; title: string; html: string; icon?: string }>(sections: T[]) {
  return sections.map((s) => ({
    id: s.id,
    title: s.title.slice(0, 120),
    html: sanitizeHtml(s.html),
    ...(s.icon && { icon: s.icon.slice(0, 40) }),
  }));
}
