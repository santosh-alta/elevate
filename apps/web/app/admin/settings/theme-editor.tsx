"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { resolveTheme, type BrandTheme } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { UploadField } from "@/components/client/uploader";
import { Button, Card, CardBody, CardHeader, Field, FieldGroup, Input } from "@/components/ui";
import { brandColors, contrast, fontFamilies, googleFamilies, googleFontHref } from "@/lib/theme";
import type { Tenant } from "@/lib/types";

type ColorKey = keyof BrandTheme["colors"];

const COLOR_GROUPS: { title: string; hint: string; fields: { key: ColorKey; label: string }[] }[] = [
  {
    title: "Brand colours",
    hint: "Primary is used for headings and standard buttons; secondary for the main call to action (Register, Apply).",
    fields: [
      { key: "primary", label: "Primary" },
      { key: "primaryFg", label: "Text on primary" },
      { key: "secondary", label: "Secondary / call to action" },
      { key: "secondaryFg", label: "Text on secondary" },
      { key: "accent", label: "Accent (links, focus, icons)" },
      { key: "highlight", label: "Highlight (badges, use sparingly)" },
    ],
  },
  {
    title: "Hero, header & footer",
    hint: "Large banners on the home and event pages, the site footer, the admin sidebar and emails.",
    fields: [
      { key: "heroBg", label: "Hero background" },
      { key: "heroFg", label: "Hero text" },
    ],
  },
  {
    title: "Page",
    hint: "Backgrounds, text and borders.",
    fields: [
      { key: "bg", label: "Page background" },
      { key: "card", label: "Card background" },
      { key: "fg", label: "Text" },
      { key: "muted", label: "Muted text" },
      { key: "border", label: "Borders" },
    ],
  },
];

/** Text/background pairs checked for WCAG AA (4.5:1). */
const PAIRS: { fg: ColorKey; bg: ColorKey; label: string }[] = [
  { fg: "primaryFg", bg: "primary", label: "Text on primary" },
  { fg: "secondaryFg", bg: "secondary", label: "Text on secondary" },
  { fg: "heroFg", bg: "heroBg", label: "Hero text" },
  { fg: "fg", bg: "bg", label: "Page text" },
  { fg: "muted", bg: "card", label: "Muted text on cards" },
];

const FONTS = ["Inter", "Figtree", "Poppins", "Manrope", "DM Sans", "Plus Jakarta Sans", "Outfit", "Nunito", "Lato", "Montserrat", "Space Grotesk", "Sora", "Work Sans", "Lexend", "Urbanist"];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Drop empty optional fields so the API keeps a clean theme. */
function cleanTheme(t: BrandTheme): BrandTheme {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  return out as unknown as BrandTheme;
}

export function ThemeEditor({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [theme, setTheme] = useState<BrandTheme>(resolveTheme(tenant.theme));
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const c = theme.colors;
  const set = (patch: Partial<BrandTheme>) => setTheme((t) => ({ ...t, ...patch }));
  const setColor = (k: ColorKey, v: string) => setTheme((t) => ({ ...t, colors: { ...t.colors, [k]: v } }));
  const gradient = theme.gradient ?? [c.primary, c.accent];
  const invalid = Object.entries(c).filter(([, v]) => !HEX.test(v)).map(([k]) => k);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await callApi("PATCH", "/admin/theme", { theme: cleanTheme(theme) });
      setMsg({ ok: true, text: "Theme saved. It's live on web and mobile." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Colours" description="Every page, email and the mobile app use these. Hex values like #191445." />
          <CardBody className="space-y-6">
            {COLOR_GROUPS.map((g) => (
              <fieldset key={g.title} className="space-y-3">
                <legend className="text-sm font-semibold">{g.title}</legend>
                <p className="-mt-1 text-xs text-muted">{g.hint}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.fields.map((f) => <ColorInput key={f.key} label={f.label} value={c[f.key]} onChange={(v) => setColor(f.key, v)} />)}
                </div>
              </fieldset>
            ))}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Brand gradient</legend>
              <p className="-mt-1 text-xs text-muted">Thin accent bars, footer strip and image placeholders.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <ColorInput label="From" value={gradient[0]} onChange={(v) => set({ gradient: [v, gradient[1]] })} />
                <ColorInput label="To" value={gradient[1]} onChange={(v) => set({ gradient: [gradient[0], v] })} />
              </div>
              <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})` }} />
            </fieldset>
            <ContrastReport theme={theme} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Logos & icons" description="Upload a file or paste a link. Site-relative paths like /brands/… work too." />
          <CardBody className="grid gap-5 sm:grid-cols-2" key={resetKey}>
            <AssetField label="Logo (light backgrounds)" hint="Header, login, reports. Transparent PNG or SVG." value={theme.logoUrl} onChange={(v) => set({ logoUrl: v })} />
            <AssetField label="Logo for dark backgrounds" hint="Footer, admin sidebar, emails. Falls back to the main logo." value={theme.logoDarkUrl} onChange={(v) => set({ logoDarkUrl: v })} dark={c.heroBg} />
            <AssetField label="Brand icon" hint="Square mark, 512×512." value={theme.iconUrl} onChange={(v) => set({ iconUrl: v })} />
            <AssetField label="Favicon" hint="Square PNG, 48×48 or larger." value={theme.faviconUrl} onChange={(v) => set({ faviconUrl: v })} />
            <AssetField label="Apple touch icon" hint="180×180 PNG, no transparency." value={theme.appleTouchIconUrl} onChange={(v) => set({ appleTouchIconUrl: v })} />
            <AssetField label="Social share image" hint="1200×630, used when an event has no cover." value={theme.ogImageUrl} onChange={(v) => set({ ogImageUrl: v })} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Typography & voice" />
          <CardBody className="space-y-4">
            <datalist id="theme-fonts">{FONTS.map((f) => <option key={f} value={f} />)}</datalist>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Body font" hint="Google Fonts family name.">
                <Input list="theme-fonts" value={theme.font ?? ""} onChange={(e) => set({ font: e.target.value || undefined })} placeholder="Inter" />
              </Field>
              <Field label="Heading font" hint="Defaults to the body font.">
                <Input list="theme-fonts" value={theme.headingFont ?? ""} onChange={(e) => set({ headingFont: e.target.value || undefined })} placeholder={theme.font ?? "Inter"} />
              </Field>
            </div>
            <Field
              label="Licensed font stylesheet (optional)"
              hint={<>For fonts not on Google Fonts, e.g. an Adobe Fonts kit (https://use.typekit.net/xxxx.css). Then list the licensed family first and a Google fallback after it, e.g. <code className="font-mono">Proxima Nova, Figtree</code>.</>}
            >
              <Input value={theme.fontCssUrl ?? ""} onChange={(e) => set({ fontCssUrl: e.target.value || undefined })} placeholder="https://use.typekit.net/abc1234.css" />
            </Field>
            <Field label="Tagline" hint="Home page headline, footer and emails. The last word is highlighted.">
              <Input value={theme.tagline ?? ""} onChange={(e) => set({ tagline: e.target.value || undefined })} placeholder="Learn, build and grow at our events." maxLength={120} />
            </Field>
            <Field label={`Corner radius (${theme.radius ?? 12}px)`}>
              <input type="range" min={0} max={24} value={theme.radius ?? 12} onChange={(e) => set({ radius: Number(e.target.value) })} className="mt-2 w-full accent-[rgb(var(--accent))]" />
            </Field>
          </CardBody>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-brand border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <Button disabled={busy || invalid.length > 0} onClick={save}>{busy ? "Saving…" : "Save theme"}</Button>
          <Button variant="ghost" onClick={() => { setTheme(resolveTheme(tenant.theme)); setResetKey((k) => k + 1); setMsg(null); }}>Reset</Button>
          {invalid.length > 0 && <span className="text-sm text-red-700">Fix colour values: {invalid.join(", ")}</span>}
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status">{msg.text}</span>}
        </div>
      </div>

      <div className="space-y-3 xl:sticky xl:top-6 xl:self-start">
        <p className="text-sm font-medium text-muted">Live preview</p>
        <ThemePreview theme={theme} tenant={tenant} />
      </div>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ok = HEX.test(value);
  return (
    <Field label={<span className="text-xs font-medium">{label}</span>}>
      <div className="flex items-center gap-2">
        <input type="color" value={ok ? value : "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour picker`} className="h-10 w-12 shrink-0 cursor-pointer rounded border border-border bg-card" />
        <Input value={value} onChange={(e) => onChange(e.target.value.trim())} aria-invalid={!ok} className={`font-mono text-xs ${ok ? "" : "border-red-500"}`} />
      </div>
    </Field>
  );
}

function AssetField({ label, hint, value, onChange, dark }: { label: string; hint: string; value?: string; onChange: (v: string | undefined) => void; dark?: string }) {
  return (
    <FieldGroup label={label} hint={hint}>
      <UploadField image={false} defaultValue={value} onChange={(v) => onChange(v.trim() || undefined)} />
      {value && (
        <div className="flex h-14 items-center justify-center rounded-lg border border-border p-2" style={{ background: dark ?? "repeating-conic-gradient(#f1f5f9 0% 25%, #fff 0% 50%) 50% / 16px 16px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </FieldGroup>
  );
}

function ContrastReport({ theme }: { theme: BrandTheme }) {
  const c = theme.colors;
  const rows = PAIRS.filter((p) => HEX.test(c[p.fg]) && HEX.test(c[p.bg])).map((p) => ({ ...p, ratio: contrast(c[p.fg], c[p.bg]) }));
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">Readability (WCAG AA needs 4.5:1)</p>
      <ul className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span className="flex h-6 w-10 items-center justify-center rounded text-[11px] font-bold" style={{ background: c[r.bg], color: c[r.fg] }}>Aa</span>
            <span className="flex-1">{r.label}</span>
            <span className={`inline-flex items-center gap-1 font-mono ${r.ratio >= 4.5 ? "text-emerald-700" : "text-red-700"}`}>
              {r.ratio >= 4.5 ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{r.ratio.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
      {rows.some((r) => r.ratio < 4.5) && <p className="mt-2 text-xs text-muted">Low-contrast pairs are corrected automatically on the site (a readable text colour is picked), but it&apos;s best to fix them here.</p>}
    </div>
  );
}

function ThemePreview({ theme, tenant }: { theme: BrandTheme; tenant: Tenant }) {
  const { colors: c, gradient } = brandColors(theme);
  const grad = `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`;
  const r = theme.radius ?? 12;
  const body = `${fontFamilies(theme.font).map((f) => `"${f}"`).join(", ") || "Inter"}, system-ui, sans-serif`;
  const heading = `${fontFamilies(theme.headingFont ?? theme.font).map((f) => `"${f}"`).join(", ") || "Inter"}, system-ui, sans-serif`;
  const words = (theme.tagline || "Learn, build and grow at our events.").trim().split(/\s+/);
  const last = words.pop();
  const logo = (dark: boolean) => {
    const src = dark ? theme.logoDarkUrl || theme.logoUrl : theme.logoUrl;
    // eslint-disable-next-line @next/next/no-img-element
    if (src) return <img src={src} alt="" className="h-7 w-auto" />;
    return (
      <span className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold" style={dark ? { background: `${c.heroFg}26`, color: c.heroFg } : { background: c.primary, color: c.primaryFg }}>{tenant.name[0]}</span>
        <span className="text-sm font-bold" style={{ fontFamily: heading }}>{tenant.name}</span>
      </span>
    );
  };
  const btn = (bg: string, fg: string, children: ReactNode, extra?: React.CSSProperties) => (
    <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold" style={{ background: bg, color: fg, borderRadius: r, ...extra }}>{children}</span>
  );

  return (
    <div className="space-y-4">
      {theme.fontCssUrl && <link rel="stylesheet" href={theme.fontCssUrl} />}
      {googleFamilies(theme).map((f) => <link key={f} rel="stylesheet" href={googleFontHref(f)!} />)}
      <div className="overflow-hidden border shadow-sm" style={{ background: c.bg, color: c.fg, borderColor: c.border, borderRadius: r, fontFamily: body }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: c.card, borderBottom: `1px solid ${c.border}` }}>
          <div className="flex items-center gap-3">
            {logo(false)}
            {theme.logoUrl && <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: c.fg, opacity: 0.7 }}>Events</span>}
          </div>
          {btn(c.primary, c.primaryFg, "Sign in", { padding: "6px 12px", fontSize: 12 })}
        </div>
        {/* Hero */}
        <div className="relative overflow-hidden px-6 py-8" style={{ background: c.heroBg, color: c.heroFg }}>
          <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(60% 80% at 100% 0%, ${gradient[0]}59, transparent 60%), radial-gradient(50% 70% at 85% 100%, ${gradient[1]}40, transparent 60%)` }} />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ opacity: 0.85 }}>{tenant.name} Events</p>
            <h3 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight" style={{ fontFamily: heading }}>
              {words.join(" ")} <span style={{ color: c.heroAccent }}>{last}</span>
            </h3>
            <div className="mt-3 h-1.5 w-16 rounded-full" style={{ background: grad }} />
            <div className="mt-5 flex flex-wrap gap-2">
              {btn(c.secondary, c.secondaryFg, <>Explore events <ArrowRight className="h-3.5 w-3.5" /></>)}
              {btn("transparent", c.heroFg, "My tickets", { boxShadow: `inset 0 0 0 1px ${c.heroFg}66` })}
            </div>
          </div>
        </div>
        {/* Event card */}
        <div className="p-5">
          <p className="text-lg font-bold tracking-tight" style={{ fontFamily: heading }}>Upcoming events</p>
          <div className="mt-1 h-1 w-8 rounded-full" style={{ background: grad }} />
          <div className="mt-4 overflow-hidden border" style={{ background: c.card, borderColor: c.border, borderRadius: r }}>
            <div className="relative h-20" style={{ background: c.heroBg }}>
              <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(70% 90% at 100% 0%, ${gradient[0]}8c, transparent 65%), radial-gradient(60% 80% at 0% 100%, ${gradient[1]}66, transparent 60%)` }} />
              <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: grad }} />
            </div>
            <div className="space-y-2 p-4">
              <div className="flex gap-1.5">
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: c.highlight, color: c.highlightFg }}>Hackathon</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${c.secondary}26`, color: c.fg }}>Registration open</span>
              </div>
              <p className="font-bold" style={{ fontFamily: heading }}>Build Weekend 2026</p>
              <p className="text-xs" style={{ color: c.muted }}>36 hours · 3 tracks · <span style={{ color: c.primary, textDecoration: "underline", textDecorationColor: c.accent, textDecorationThickness: 2, textUnderlineOffset: 3 }}>View details</span></p>
              <div className="flex gap-2 pt-1">
                {btn(c.secondary, c.secondaryFg, "Register now")}
                {btn(c.primary, c.primaryFg, "Details")}
              </div>
            </div>
          </div>
        </div>
        {/* Footer */}
        <div style={{ background: c.heroBg, color: c.heroFg }}>
          <div className="h-1.5" style={{ background: grad }} />
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            {logo(true)}
            <span className="text-xs" style={{ opacity: 0.85 }}>{theme.tagline || `© ${new Date().getFullYear()} ${tenant.name}`}</span>
          </div>
        </div>
      </div>

      {/* Social card */}
      <div className="overflow-hidden rounded-lg border border-border bg-card text-sm shadow-sm">
        {theme.ogImageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={theme.ogImageUrl} alt="" className="aspect-[1200/630] w-full object-cover" />
          : <div className="flex aspect-[1200/630] items-center justify-center text-xs text-muted" style={{ background: c.heroBg, color: c.heroFg }}>No share image: link previews use the event cover or logo</div>}
        <div className="border-t border-border px-3 py-2">
          <p className="text-xs uppercase text-muted">Link preview</p>
          <p className="font-medium">{tenant.name} Events</p>
        </div>
      </div>
    </div>
  );
}
