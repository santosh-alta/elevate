"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { callApi } from "./api";
import { cn } from "../ui/cn";

/** Event details from a form that may not be saved yet. They win over the saved event on the server. */
export type AiEventInput = {
  title?: string; tagline?: string; type?: string; mode?: string; venue?: string;
  startsAt?: string; endsAt?: string; campuses?: string[]; tags?: string[];
};

export type AiUsage = { enabled: boolean; used: number; limit: number; remaining: number };

export type AiRequest = {
  kind: "description" | "rewrite" | "tagline" | "section" | "faqs";
  eventId?: string;
  event?: AiEventInput;
  notes?: string;
  text?: string;
  html?: boolean;
  style?: "shorter" | "longer" | "engaging" | "professional" | "grammar" | "simpler";
  sectionTitle?: string;
};

export type AiResponse = { html?: string; text?: string; options?: string[]; faqs?: { q: string; a: string }[]; usage: AiUsage };

// One shared copy of today's allowance, so every AI button on the page shows the same count.
let usage: AiUsage | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (!loading) {
    loading = callApi<AiUsage>("GET", "/ai/usage")
      .then((u) => { usage = u; })
      .catch(() => { usage = { enabled: false, used: 0, limit: 0, remaining: 0 }; })
      .finally(emit);
  }
  return loading;
}

/** Today's AI allowance for the signed-in person (null while loading). */
export function useAiUsage(): AiUsage | null {
  useEffect(() => { void load(); }, []);
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => usage,
    () => null,
  );
}

export async function aiWrite(req: AiRequest): Promise<AiResponse> {
  try {
    const res = await callApi<AiResponse>("POST", "/ai/write", req);
    usage = res.usage;
    return res;
  } catch (e) {
    // Refresh the count (e.g. the daily limit was reached in another tab).
    loading = null;
    void load();
    throw e;
  } finally {
    emit();
  }
}

export function usageLabel(u: AiUsage | null) {
  if (!u) return "";
  return u.remaining > 0 ? `${u.remaining} of ${u.limit} AI uses left today` : "No AI uses left today. They reset at midnight.";
}

/** Small "✨ label" button used next to fields. Hidden when AI isn't available to this person. */
export function AiButton({
  onClick, busy, label = "AI", className, title,
}: { onClick: () => void; busy?: boolean; label?: string; className?: string; title?: string }) {
  const u = useAiUsage();
  if (!u?.enabled) return null;
  const out = u.remaining <= 0;
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={busy || out}
      title={out ? usageLabel(u) : title ?? usageLabel(u)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/10 px-3 py-1 text-xs font-semibold text-primary transition hover:from-primary/15 hover:to-accent/15 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {busy ? "Writing…" : label}
    </button>
  );
}
