"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Loader2, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { callApi } from "./api";
import { cn } from "../ui/cn";

type Msg = { role: "user" | "assistant"; text: string };
type Usage = { used: number; limit: number; remaining: number };
type Info = {
  enabled: boolean; signedIn: boolean; brand: string; level: "member" | "team" | "hq" | null;
  suggestions: string[]; usage: Usage | null;
};

const STORE = "assistant-chat";
const LEVEL_BADGE: Record<string, string> = { hq: "HQ access", team: "Organiser access" };

function loadHistory(): Msg[] {
  try { return JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as Msg[]; } catch { return []; }
}
function saveHistory(m: Msg[]) {
  try { sessionStorage.setItem(STORE, JSON.stringify(m.slice(-30))); } catch { /* private mode */ }
}

/** Floating assistant: a bubble in the corner that opens a chat panel. What it knows depends on the person's role. */
export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [infoErr, setInfoErr] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMessages(loadHistory()); }, []);
  useEffect(() => {
    if (!open || info) return;
    callApi<Info>("GET", "/ai/chat/info").then(setInfo).catch(() => setInfoErr(true));
  }, [open, info]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", text: q }];
    setMessages(next); saveHistory(next); setInput(""); setError(null); setBusy(true);
    try {
      const r = await callApi<{ reply: string; usage: Usage }>("POST", "/ai/chat", { messages: next.slice(-12) });
      const done: Msg[] = [...next, { role: "assistant", text: r.reply }];
      setMessages(done); saveHistory(done);
      setInfo((i) => (i ? { ...i, usage: r.usage } : i));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([]); saveHistory([]); setError(null);
  }

  const short = info?.brand?.split(" ")[0] ?? "";
  const out = !!info?.usage && info.usage.remaining <= 0;
  const canChat = !!info?.enabled && !!info?.signedIn && !out;

  return (
    <div className="print:hidden">
      <button
        type="button"
        data-tour="assistant"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Ask the assistant"}
        aria-expanded={open}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lift ring-4 ring-white/60 transition duration-300 hover:-translate-y-0.5 hover:shadow-glow focus:outline-none focus-visible:ring-accent",
          open && "rotate-90",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        {!open && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse-dot rounded-full border-2 border-white bg-emerald-400" aria-hidden />}
      </button>

      {open && (
        <section
          role="dialog" aria-label="Assistant"
          className="fixed inset-x-2 bottom-24 top-16 z-50 flex animate-pop-in flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lift sm:inset-x-auto sm:right-5 sm:top-auto sm:h-[min(640px,calc(100vh-8rem))] sm:w-[400px]"
        >
          <header className="relative overflow-hidden bg-hero-bg px-4 py-3 text-hero-fg">
            <div aria-hidden className="absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-40 blur-2xl" style={{ background: "rgb(var(--gradient-from))" }} />
            <div className="relative flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Sparkles className="h-5 w-5 text-hero-accent" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-heading font-bold leading-tight">Ask {short || "us"}</p>
                <p className="text-xs text-hero-fg/75">Events, registrations, certificates and more</p>
              </div>
              {info?.level && LEVEL_BADGE[info.level] && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold"><ShieldCheck className="h-3.5 w-3.5" />{LEVEL_BADGE[info.level]}</span>
              )}
              {messages.length > 0 && (
                <button type="button" onClick={reset} title="New chat" aria-label="Start a new chat" className="rounded-lg p-1.5 text-hero-fg/80 hover:bg-white/10"><RotateCcw className="h-4 w-4" /></button>
              )}
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-bg/50 px-4 py-4 text-sm">
            {!messages.length && (
              <div className="space-y-3">
                <div className="rounded-2xl rounded-tl-sm bg-card p-3 shadow-soft">
                  {info?.level === "hq"
                    ? "Hi! You have HQ access, so ask me anything: numbers across events and campuses, approvals, tasks, feedback, or help drafting messages."
                    : info?.level === "team"
                      ? "Hi! Ask me about your events, registrations and tasks, or get help writing a promo message."
                      : "Hi! I can help you find events, explain how to register, and where to find your tickets and certificates."}
                </div>
                {info && (
                  <div className="flex flex-wrap gap-2">
                    {info.suggestions.map((s) => (
                      <button
                        key={s} type="button" disabled={!canChat || busy} onClick={() => void send(s)}
                        className="rounded-full border border-primary/25 bg-card px-3 py-1.5 text-left text-xs font-medium text-primary transition hover:border-primary/60 hover:bg-primary/5 disabled:opacity-60"
                      >{s}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed",
                  m.role === "user" ? "rounded-br-sm bg-primary text-white" : "rounded-tl-sm bg-card shadow-soft",
                )}>
                  {m.role === "user" ? <p className="whitespace-pre-wrap">{m.text}</p> : <Markdown text={m.text} onNavigate={() => { if (window.innerWidth < 640) setOpen(false); }} />}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-card px-3.5 py-3 shadow-soft" aria-label="Thinking">
                  {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${d * 120}ms` }} />)}
                </div>
              </div>
            )}
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          </div>

          <footer className="border-t border-border bg-card p-3">
            {!info && !infoErr && <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</p>}
            {infoErr && <p className="text-xs text-red-600">The assistant can't be reached right now.</p>}
            {info && !info.enabled && <p className="text-xs text-muted">The assistant isn't available yet.</p>}
            {info?.enabled && !info.signedIn && (
              <Link href={`/login?next=${encodeURIComponent(pathname || "/")}`} className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                Sign in to chat
              </Link>
            )}
            {info?.enabled && info.signedIn && (
              <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex items-end gap-2">
                <textarea
                  ref={inputRef} rows={1} value={input} maxLength={2000} disabled={out}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                  placeholder={out ? "No messages left today" : "Ask anything about events…"}
                  className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border bg-bg px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <button type="submit" disabled={!input.trim() || busy || out} aria-label="Send" className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:opacity-90 disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </button>
              </form>
            )}
            {info?.usage && (
              <p className={cn("mt-2 text-center text-[11px]", out ? "text-red-600" : "text-muted")}>
                {out ? "You've used today's messages. Back tomorrow!" : `${info.usage.remaining} of ${info.usage.limit} messages left today · Answers can be wrong, check the event page`}
              </p>
            )}
          </footer>
        </section>
      )}
    </div>
  );
}

/** Tiny, safe markdown: paragraphs, bullet/numbered lists, **bold**, `code` and links. No raw HTML. */
function Markdown({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(" "), onNavigate)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={cn("space-y-1 pl-5", list.ordered ? "list-decimal" : "list-disc")}>
        {list.items.map((it, i) => <li key={i}>{inline(it, onNavigate)}</li>)}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? num)![1]);
    } else if (!line) {
      flushPara(); flushList();
    } else if (/^#{1,4}\s+/.test(line)) {
      flushPara(); flushList();
      blocks.push(<p key={blocks.length} className="font-semibold">{inline(line.replace(/^#+\s+/, ""), onNavigate)}</p>);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  return <div className="space-y-2 break-words">{blocks}</div>;
}

function inline(s: string, onNavigate: () => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[2]) out.push(<code key={m.index} className="rounded bg-fg/5 px-1 text-[0.85em]">{m[2]}</code>);
    else {
      const href = m[4];
      const cls = "font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary";
      if (href.startsWith("/") && !href.startsWith("//")) out.push(<Link key={m.index} href={href} onClick={onNavigate} className={cls}>{m[3]}</Link>);
      else if (/^https:\/\//i.test(href)) out.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer nofollow" className={cls}>{m[3]}</a>);
      else out.push(m[3]);
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>);
}
