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
  "google-off": "Google sign-in isn't set up yet. Please use another option.",
  "github-off": "GitHub sign-in isn't set up yet. Please use another option.",
  "login-cancelled": "Sign-in was cancelled.",
  "login-expired": "That sign-in attempt expired. Please try again.",
  "login-failed": "Sign-in didn't work. Please try again, or use another option.",
};

const BUTTON =
  "flex h-11 w-full items-center justify-center gap-3 rounded-brand border text-sm font-medium shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; message?: string }> }) {
  const { next, error, message } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/me";
  if (await getMe()) redirect(safeNext);
  const [tenant, providers] = await Promise.all([requireTenant(), apiGet<{ google: string | null; github: string | null }>("/auth/providers")]);
  const href = (p: string) => `/api/auth/${p}/start?next=${encodeURIComponent(safeNext)}`;
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card className="relative w-full max-w-sm overflow-hidden p-8 pt-9 shadow-lg">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" aria-hidden />
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo tenant={tenant} size={44} />
          <h1 className="mt-5 font-heading text-2xl font-bold tracking-tight">Sign in to {tenant.name} Events</h1>
          <p className="mt-1 text-sm text-muted">No password needed.</p>
        </div>
        {error && ERRORS[error] && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message || ERRORS[error]}</p>}
        {(providers?.google || providers?.github) && (
          <div className="space-y-3">
            {providers.google && (
            <a href={href("google")} className={`${BUTTON} border-border bg-white text-slate-800 hover:bg-slate-50`}>
              <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </a>
            )}
            {providers.github && (
              <a href={href("github")} className={`${BUTTON} border-slate-900 bg-slate-900 text-white hover:bg-slate-800`}>
                <svg aria-hidden viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                Continue with GitHub
              </a>
            )}
            <div className="flex items-center gap-3 pt-2 pb-3 text-xs text-muted"><span className="h-px flex-1 bg-border" />or use your email<span className="h-px flex-1 bg-border" /></div>
          </div>
        )}
        <LoginForm next={safeNext} />
      </Card>
    </div>
  );
}
