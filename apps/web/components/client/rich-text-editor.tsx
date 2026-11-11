"use client";

import { useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import {
  Bold, Code, Columns3, Heading2, Heading3, ImagePlus, Italic, Link2, Link2Off, List, ListOrdered, Minus, Quote,
  Loader2, Redo2, Rows3, Sparkles, SquareCode, Strikethrough, Table2, Trash2, Underline as UnderlineIcon, Undo2,
} from "lucide-react";
import { DOMSerializer } from "@tiptap/pm/model";
import { cn } from "../ui/cn";
import { MAX_UPLOAD_BYTES, uploadFile } from "./upload";
import { AiButton, aiWrite, useAiUsage, usageLabel, type AiEventInput, type AiRequest } from "./ai-assist";

/** Turns on the ✨ AI panel: write the whole text from the event's details, or rewrite the selection / everything. */
export type EditorAi = {
  kind: "description" | "section";
  eventId?: string;
  sectionTitle?: string;
  /** Unsaved values from the surrounding form */
  getEvent?: () => AiEventInput;
};

function isEmptyHtml(html: string) {
  return !html || /^(<p>\s*<\/p>)*$/.test(html.trim());
}

/**
 * Rich-text editor (TipTap). Writes its HTML into a hidden input `name` so it works inside ApiForm / FormData,
 * and also reports changes through `onChange`. Images upload through /uploads (via the proxy) or come from a URL.
 */
export function RichTextEditor({
  name, defaultValue, onChange, placeholder = "Write something…", eventId, className, minHeight = "12rem", compact, ai,
}: {
  name?: string; defaultValue?: string | null; onChange?: (html: string) => void; placeholder?: string;
  eventId?: string; className?: string; minHeight?: string; compact?: boolean; ai?: EditorAi;
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [html, setHtml] = useState(defaultValue ?? "");
  const [uploading, setUploading] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder }),
    ],
    content: defaultValue || "",
    editorProps: {
      attributes: { class: "tiptap prose prose-brand prose-sm max-w-none px-4 py-3 focus:outline-none", style: `min-height:${minHeight}` },
    },
    onUpdate: ({ editor: ed }) => {
      const out = ed.isEmpty ? "" : ed.getHTML();
      setHtml(out);
      onChange?.(out);
    },
  });

  async function onFile(f: File) {
    if (!editor) return;
    if (f.size > MAX_UPLOAD_BYTES) { setErr("Image is larger than 15 MB"); return; }
    setErr(null); setUploading(0);
    try {
      const r = await uploadFile("/uploads", f, { eventId }, setUploading);
      editor.chain().focus().setImage({ src: r.url, alt: f.name.replace(/\.[^.]+$/, "") }).run();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-brand border border-border bg-card focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20", className)}>
      {editor ? (
        <Toolbar
          editor={editor} compact={compact} uploading={uploading} onPickImage={() => fileRef.current?.click()}
          aiButton={ai && <AiButton label="AI" onClick={() => setAiOpen((o) => !o)} className={cn("ml-auto", aiOpen && "ring-2 ring-primary/30")} title="Write or rewrite with AI" />}
        />
      ) : <div className="h-10 border-b border-border bg-bg" />}
      {editor && ai && aiOpen && <AiPanel editor={editor} ai={ai} onClose={() => setAiOpen(false)} />}
      <EditorContent editor={editor} />
      {!editor && <div className="px-4 py-3 text-sm text-muted" style={{ minHeight }}>Loading editor…</div>}
      {name && <input type="hidden" name={name} value={isEmptyHtml(html) ? "" : html} data-keep-empty />}
      <input
        ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }}
      />
      {err && <p className="border-t border-border px-3 py-1.5 text-xs text-red-600">{err}</p>}
    </div>
  );
}

function Btn({ onClick, active, disabled, label, children }: { onClick: () => void; active?: boolean; disabled?: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-fg/80 transition-colors hover:bg-fg/5 disabled:opacity-40",
        active && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-border" aria-hidden />;

function Toolbar({ editor, compact, uploading, onPickImage, aiButton }: { editor: Editor; compact?: boolean; uploading: number | null; onPickImage: () => void; aiButton?: ReactNode }) {
  const c = () => editor.chain().focus();
  const inTable = editor.isActive("table");
  const ic = "h-4 w-4";

  function setLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (!url.trim() || url.trim() === "https://") { c().extendMarkRange("link").unsetLink().run(); return; }
    c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }
  function imageFromUrl() {
    const url = window.prompt("Image URL (https://…)");
    if (url && /^https?:\/\//i.test(url.trim())) c().setImage({ src: url.trim() }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-bg/60 px-1.5 py-1">
      <Btn label="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className={ic} /></Btn>
      <Btn label="Subheading" active={editor.isActive("heading", { level: 3 })} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 className={ic} /></Btn>
      <Sep />
      <Btn label="Bold" active={editor.isActive("bold")} onClick={() => c().toggleBold().run()}><Bold className={ic} /></Btn>
      <Btn label="Italic" active={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}><Italic className={ic} /></Btn>
      <Btn label="Underline" active={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()}><UnderlineIcon className={ic} /></Btn>
      <Btn label="Strikethrough" active={editor.isActive("strike")} onClick={() => c().toggleStrike().run()}><Strikethrough className={ic} /></Btn>
      <Btn label="Inline code" active={editor.isActive("code")} onClick={() => c().toggleCode().run()}><Code className={ic} /></Btn>
      <Sep />
      <Btn label="Bullet list" active={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}><List className={ic} /></Btn>
      <Btn label="Numbered list" active={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}><ListOrdered className={ic} /></Btn>
      <Btn label="Quote" active={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}><Quote className={ic} /></Btn>
      {!compact && <Btn label="Code block" active={editor.isActive("codeBlock")} onClick={() => c().toggleCodeBlock().run()}><SquareCode className={ic} /></Btn>}
      <Sep />
      <Btn label="Link" active={editor.isActive("link")} onClick={setLink}><Link2 className={ic} /></Btn>
      {editor.isActive("link") && <Btn label="Remove link" onClick={() => c().extendMarkRange("link").unsetLink().run()}><Link2Off className={ic} /></Btn>}
      <Btn label={uploading !== null ? `Uploading ${uploading}%` : "Upload image"} disabled={uploading !== null} onClick={onPickImage}><ImagePlus className={ic} /></Btn>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={imageFromUrl} className="h-8 rounded-md px-1.5 text-[11px] font-medium text-muted hover:bg-fg/5" title="Insert image from a URL">URL</button>
      {uploading !== null && <span className="text-[11px] text-muted">{uploading}%</span>}
      {!compact && <Btn label="Insert table" active={inTable} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 className={ic} /></Btn>}
      <Btn label="Divider" onClick={() => c().setHorizontalRule().run()}><Minus className={ic} /></Btn>
      <Sep />
      <Btn label="Undo" disabled={!editor.can().undo()} onClick={() => c().undo().run()}><Undo2 className={ic} /></Btn>
      <Btn label="Redo" disabled={!editor.can().redo()} onClick={() => c().redo().run()}><Redo2 className={ic} /></Btn>
      {aiButton}
      {inTable && (
        <div className="flex w-full flex-wrap items-center gap-1 border-t border-border pt-1 text-[11px]">
          <span className="px-1 text-muted">Table:</span>
          <TBtn onClick={() => c().addRowAfter().run()}><Rows3 className="h-3.5 w-3.5" />+ row</TBtn>
          <TBtn onClick={() => c().addColumnAfter().run()}><Columns3 className="h-3.5 w-3.5" />+ column</TBtn>
          <TBtn onClick={() => c().deleteRow().run()}>− row</TBtn>
          <TBtn onClick={() => c().deleteColumn().run()}>− column</TBtn>
          <TBtn onClick={() => c().toggleHeaderRow().run()}>Header row</TBtn>
          <TBtn onClick={() => c().deleteTable().run()}><Trash2 className="h-3.5 w-3.5" />Delete table</TBtn>
        </div>
      )}
    </div>
  );
}

function TBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 hover:bg-bg">
      {children}
    </button>
  );
}

const REWRITES: { style: NonNullable<AiRequest["style"]>; label: string }[] = [
  { style: "engaging", label: "More engaging" },
  { style: "professional", label: "More professional" },
  { style: "shorter", label: "Shorter" },
  { style: "longer", label: "Longer" },
  { style: "simpler", label: "Simpler" },
  { style: "grammar", label: "Fix grammar" },
];

function selectionHtml(editor: Editor): string {
  const frag = DOMSerializer.fromSchema(editor.schema).serializeFragment(editor.state.selection.content().content);
  const div = document.createElement("div");
  div.appendChild(frag);
  return div.innerHTML;
}

/** Inline panel under the toolbar (not a popup, so the editor's rounded frame never clips it). */
function AiPanel({ editor, ai, onClose }: { editor: Editor; ai: EditorAi; onClose: () => void }) {
  const usage = useAiUsage();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasText = !editor.isEmpty;
  const { from, to, empty } = editor.state.selection;
  const out = !!usage && usage.remaining <= 0;
  const what = ai.kind === "section" ? `the ${ai.sectionTitle?.trim() || "section"}` : "the description";

  async function run(key: string, req: AiRequest, apply: (html: string) => void) {
    setBusy(key); setMsg(null);
    try {
      const r = await aiWrite(req);
      if (r.html) apply(r.html);
      setMsg({ ok: true, text: "Done. Read it through and edit anything that's off. Undo brings back your text." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  }

  function write() {
    if (hasText && !window.confirm(`Replace the current text with a new AI draft of ${what}?`)) return;
    void run("write", {
      kind: ai.kind, eventId: ai.eventId, sectionTitle: ai.sectionTitle, event: ai.getEvent?.(), notes: notes.trim() || undefined,
    }, (html) => editor.chain().focus().setContent(html, { emitUpdate: true }).run());
  }

  function rewrite(style: NonNullable<AiRequest["style"]>) {
    const partial = !empty;
    const text = partial ? selectionHtml(editor) : editor.getHTML();
    void run(style, { kind: "rewrite", style, html: true, text }, (html) => {
      if (partial) editor.chain().focus().insertContentAt({ from, to }, html).run();
      else editor.chain().focus().setContent(html, { emitUpdate: true }).run();
    });
  }

  return (
    <div className="space-y-3 border-b border-border bg-gradient-to-br from-primary/[0.06] to-accent/[0.06] px-3 py-3 text-sm">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">Write {what} with AI</p>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1500}
            placeholder="Optional notes: speaker, topics, prizes, what students will take away…"
            className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button" onClick={write} disabled={!!busy || out}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === "write" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {busy === "write" ? "Writing… (10–20 seconds)" : hasText ? "Write a new draft" : "Write it for me"}
            </button>
            <span className="text-xs text-muted">Uses the title, type, dates and campus from this event.</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-0.5 text-xs text-muted hover:bg-fg/5" aria-label="Close AI panel">Close</button>
      </div>

      {hasText && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          <span className="mr-1 text-xs text-muted">Rewrite {empty ? "everything" : "the selected text"}:</span>
          {REWRITES.map((r) => (
            <button
              key={r.style} type="button" disabled={!!busy || out}
              onMouseDown={(e) => e.preventDefault()} onClick={() => rewrite(r.style)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium transition hover:border-primary/50 hover:text-primary disabled:opacity-50"
            >
              {busy === r.style && <Loader2 className="h-3 w-3 animate-spin" />}{r.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pl-6 text-xs">
        {msg ? <span className={msg.ok ? "text-emerald-700" : "text-red-600"}>{msg.text}</span> : <span className="text-muted">Tip: select a paragraph first to rewrite just that part.</span>}
        <span className={cn("font-medium", out ? "text-red-600" : "text-muted")}>{usageLabel(usage)}</span>
      </div>
    </div>
  );
}
