import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { BrandLogo } from "@/components/brand-logo";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "google-off": "Google sign-in isn't set up yet. Please use your email instead.",
  "google-cancelled": "Google sign-in was cancelled.",
  "google-expired": "That sign-in link expired. Please try again.",
  "google-failed": "Google sign-in didn't work. Please try again, or use your email.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/me";
  if (await getMe()) redirect(safeNext);
  const [tenant, google] = await Promise.all([requireTenant(), apiGet<{ clientId: string | null }>("/auth/google/config")]);
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card className="relative w-full max-w-sm overflow-hidden p-8 pt-9 shadow-lg">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" aria-hidden />
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo tenant={tenant} size={44} />
          <h1 className="mt-5 font-heading text-2xl font-bold tracking-tight">Sign in to {tenant.name} Events</h1>
          <p className="mt-1 text-sm text-muted">No password needed.</p>
        </div>
        {error && ERRORS[error] && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{ERRORS[error]}</p>}
        {google?.clientId && (
          <>
            <a
              href={`/api/auth/google/start?next=${encodeURIComponent(safeNext)}`}
              className="flex h-11 w-full items-center justify-center gap-3 rounded-brand border border-border bg-white text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </a>
            <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-border" />or use your email<span className="h-px flex-1 bg-border" /></div>
          </>
        )}
        <LoginForm next={safeNext} />
      </Card>
    </div>
  );
}
