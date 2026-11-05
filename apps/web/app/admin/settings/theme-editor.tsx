"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resolveTheme, type BrandTheme } from "@elevate/shared";
import { callApi } from "@/components/client/api";
import { Button, Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui";
import type { Tenant } from "@/lib/types";

const COLOR_FIELDS: { key: keyof BrandTheme["colors"]; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "primaryFg", label: "Text on primary" },
  { key: "accent", label: "Accent" },
  { key: "bg", label: "Page background" },
  { key: "card", label: "Card background" },
  { key: "fg", label: "Text" },
  { key: "muted", label: "Muted text" },
  { key: "border", label: "Borders" },
];
const FONTS = ["Inter", "Poppins", "Manrope", "DM Sans", "Plus Jakarta Sans", "Outfit", "Nunito", "Lato", "Montserrat", "Space Grotesk"];

export function ThemeEditor({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [theme, setTheme] = useState<BrandTheme>(resolveTheme(tenant.theme));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const c = theme.colors;
  const setColor = (k: keyof BrandTheme["colors"], v: string) => setTheme({ ...theme, colors: { ...c, [k]: v } });

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Brand look" />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {COLOR_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <div className="flex items-center gap-2">
                  <input type="color" value={c[f.key]} onChange={(e) => setColor(f.key, e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded border border-border bg-card" />
                  <Input value={c[f.key]} onChange={(e) => setColor(f.key, e.target.value)} className="font-mono text-xs" />
                </div>
              </Field>
            ))}
          </div>
          <Field label="Logo URL" hint="PNG or SVG, transparent background works best"><Input type="url" value={theme.logoUrl ?? ""} onChange={(e) => setTheme({ ...theme, logoUrl: e.target.value || undefined })} /></Field>
          <Field label="Favicon URL"><Input type="url" value={theme.faviconUrl ?? ""} onChange={(e) => setTheme({ ...theme, faviconUrl: e.target.value || undefined })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Font"><Select value={theme.font} onChange={(e) => setTheme({ ...theme, font: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</Select></Field>
            <Field label={`Corner radius (${theme.radius ?? 12}px)`}><input type="range" min={0} max={24} value={theme.radius ?? 12} onChange={(e) => setTheme({ ...theme, radius: Number(e.target.value) })} className="mt-3 w-full accent-[rgb(var(--primary))]" /></Field>
          </div>
          <div className="flex items-center gap-3">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true); setMsg(null);
                try { await callApi("PATCH", "/admin/theme", { theme }); setMsg("Theme saved. It's live on web and mobile."); router.refresh(); }
                catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
              }}
            >
              Save theme
            </Button>
            <Button variant="ghost" onClick={() => setTheme(resolveTheme(tenant.theme))}>Reset</Button>
            {msg && <span className="text-sm text-muted">{msg}</span>}
          </div>
        </CardBody>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted">Live preview</p>
        <div className="overflow-hidden border shadow-sm" style={{ background: c.bg, color: c.fg, borderColor: c.border, borderRadius: theme.radius, fontFamily: `"${theme.font}", system-ui, sans-serif` }}>
          {/* eslint-disable-next-line @next/next/no-css-tags */}
          <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.font ?? "Inter").replace(/%20/g, "+")}:wght@400;600;700&display=swap`} />
          <div className="flex items-center justify-between px-5 py-3" style={{ background: c.card, borderBottom: `1px solid ${c.border}` }}>
            <div className="flex items-center gap-2">
              {theme.logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={theme.logoUrl} alt="" className="h-7 w-auto" />
                : <span className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold" style={{ background: c.primary, color: c.primaryFg }}>{tenant.name[0]}</span>}
              <span className="text-sm font-semibold">{tenant.name} <span style={{ color: c.muted }} className="font-normal">Events</span></span>
            </div>
            <span className="px-3 py-1.5 text-xs font-medium" style={{ background: c.primary, color: c.primaryFg, borderRadius: theme.radius }}>Sign in</span>
          </div>
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: c.primary }}>Hackathon</p>
            <h3 className="mt-1 text-2xl font-bold">Build for Bharat 2026</h3>
            <p className="mt-1 text-sm" style={{ color: c.muted }}>36 hours · 3 tracks · ₹2,00,000 in prizes</p>
            <div className="mt-5 overflow-hidden border" style={{ background: c.card, borderColor: c.border, borderRadius: theme.radius }}>
              <div className="h-20" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.accent})` }} />
              <div className="space-y-2 p-4">
                <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${c.primary}1a`, color: c.primary }}>Registration open</span>
                <p className="font-semibold">Register your team</p>
                <span className="inline-block px-4 py-2 text-sm font-medium" style={{ background: c.primary, color: c.primaryFg, borderRadius: theme.radius }}>Register now</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
