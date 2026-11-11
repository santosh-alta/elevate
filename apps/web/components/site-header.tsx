import Link from "next/link";
import { Globe, Instagram, Linkedin, Mail, MapPin, Phone, Youtube } from "lucide-react";
import { resolveTheme } from "@elevate/shared";
import { requireTenant } from "@/lib/tenant";
import { canUseAdmin, getMe } from "@/lib/auth";
import { ROLE_LABELS } from "@elevate/shared";
import { AccountMenu } from "./client/account-menu";
import { NotificationBell } from "./client/notification-bell";
import { HeaderUser } from "./client/header-user";
import { SiteNav } from "./client/site-nav";
import { ThemeToggle } from "./client/theme-toggle";
import { TourButton } from "./client/site-tour";
import { campusHref } from "@/lib/format";
import { apiList } from "@/lib/api";
import type { AppNotification, Tenant } from "@/lib/types";
import { BrandLogo } from "./brand-logo";
import { buttonClass } from "./ui/button";

/**
 * Site header. `clientUser` loads the signed-in part in the browser, so the page itself can be pre-built
 * and shared; otherwise it is rendered on the server for this visitor.
 */
export async function SiteHeader({ tenant: given, clientUser = false }: { tenant?: Tenant; clientUser?: boolean } = {}) {
  const tenant = given ?? (await requireTenant());
  const me = clientUser ? null : await getMe();
  const theme = resolveTheme(tenant.theme);
  const unread = me ? (await apiList<AppNotification>("/me/notifications?unread=1")).filter((n) => !n.readAt).length : 0;
  return (
    <header className="site-header sticky top-0 z-30 border-b border-border/70 bg-card/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="logo-hover flex min-w-0 items-center gap-3 rounded-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label={`${tenant.name} Events home`}>
          {theme.logoUrl ? (
            <>
              <BrandLogo tenant={tenant} size={34} />
              <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
              <span className="hidden font-heading text-sm font-semibold uppercase tracking-[0.16em] text-fg/70 sm:block">Events</span>
            </>
          ) : (
            <>
              <BrandLogo tenant={tenant} size={32} />
              <span className="truncate font-heading font-bold tracking-tight">{tenant.name} <span className="font-medium text-muted">Events</span></span>
            </>
          )}
        </Link>
        <nav className="flex items-center gap-1.5 text-sm">
          <div data-tour="site-nav" className="flex items-center"><SiteNav showCampuses={tenant.campuses.length > 1} /></div>
          <div data-tour="theme" className="flex items-center"><ThemeToggle /></div>
          <div data-tour="account" className="flex items-center gap-1.5">
          {clientUser ? <HeaderUser /> : me ? (
            <>
              <NotificationBell initialUnread={unread} />
              <AccountMenu
                name={me.user.name}
                email={me.user.email}
                avatarUrl={me.user.avatarUrl}
                roleLabel={me.user.isPlatformAdmin ? "Super admin" : me.membership && me.membership.role !== "STUDENT" ? ROLE_LABELS[me.membership.role] : null}
                showAdmin={canUseAdmin(me)}
              />
            </>
          ) : (
            <Link href="/login" className={buttonClass("primary", "sm", "px-4")}>Sign in</Link>
          )}
          </div>
        </nav>
      </div>
    </header>
  );
}

function siteLinks(tenant: Tenant) {
  const s = tenant.settings;
  const social = (s.social ?? {}) as Record<string, string>;
  const website = (s.website as string | undefined) ?? social.website;
  const linkedin = s.linkedinOrgUrl ?? social.linkedin;
  const phone = s.phone as string | undefined;
  const address = s.address as string | undefined;
  return { email: s.supportEmail, website, linkedin, phone, address, instagram: social.instagram, youtube: social.youtube };
}

export async function SiteFooter({ tenant: given }: { tenant?: Tenant } = {}) {
  const tenant = given ?? (await requireTenant());
  const theme = resolveTheme(tenant.theme);
  const { email, website, linkedin, phone, address, instagram, youtube } = siteLinks(tenant);
  const linkCls = "inline-flex items-center gap-2 text-hero-fg/90 underline-offset-4 hover:text-hero-fg hover:underline";
  const tagline = theme.tagline ?? (tenant.settings.tagline as string | undefined);
  return (
    <footer className="relative isolate mt-24 overflow-hidden bg-hero-bg text-hero-fg">
      <div className="h-1.5 bg-brand-gradient" aria-hidden />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-80 w-80 animate-aurora-slow rounded-full opacity-25 blur-3xl" style={{ background: "rgb(var(--gradient-from))" }} />
        <div className="absolute -bottom-32 right-0 h-72 w-72 animate-aurora rounded-full opacity-20 blur-3xl" style={{ background: "rgb(var(--gradient-to))" }} />
        <div className="bg-grid absolute inset-0 opacity-60" />
      </div>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <BrandLogo tenant={tenant} variant="dark" size={40} showName />
          {tagline && <p className="max-w-xs font-heading text-lg font-semibold leading-snug">{tagline}</p>}
          <p className="max-w-xs text-sm text-hero-fg/80">
            {(tenant.settings.footerAbout as string | undefined) ??
              `Hackathons, masterclasses and workshops${tenant.campuses.length > 1 ? ` across ${tenant.campuses.length} campuses` : ""}.`}
          </p>
          {tenant.campuses.length > 0 && (
            <ul aria-label="Campuses" className="flex max-w-sm flex-wrap gap-2">
              {tenant.campuses.map((c) => (
                <li key={c.id}>
                  <Link
                    href={campusHref(c)}
                    title={c.name}
                    className="inline-flex rounded-full border border-hero-fg/20 px-3 py-1 text-xs text-hero-fg/85 transition hover:border-hero-accent hover:text-hero-fg"
                  >
                    {c.city ?? c.code ?? c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <nav aria-label="Footer" className="space-y-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-hero-fg/80">Explore</p>
          <ul className="space-y-2">
            <li><Link href="/events" className="text-hero-fg/90 underline-offset-4 hover:text-hero-fg hover:underline">All events</Link></li>
            <li><Link href="/calendar" className="text-hero-fg/90 underline-offset-4 hover:text-hero-fg hover:underline">Event calendar</Link></li>
            <li><Link href="/winners" className="text-hero-fg/90 underline-offset-4 hover:text-hero-fg hover:underline">Winners hall of fame</Link></li>
            <li><Link href="/me" className="text-hero-fg/90 underline-offset-4 hover:text-hero-fg hover:underline">My tickets &amp; certificates</Link></li>
            <li><Link href="/feedback" className="text-hero-fg/90 underline-offset-4 hover:text-hero-fg hover:underline">Share feedback</Link></li>
            <li><TourButton className="text-hero-fg/90 underline-offset-4 hover:text-hero-fg hover:underline">Take a quick tour</TourButton></li>
          </ul>
        </nav>
        {(email || website || linkedin || phone || address) && (
          <div className="space-y-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-hero-fg/80">Contact</p>
            <ul className="space-y-2">
              {email && <li><a href={`mailto:${email}`} className="inline-flex items-center gap-2 text-hero-fg/90 underline-offset-4 hover:text-hero-fg hover:underline"><Mail className="h-4 w-4" />{email}</a></li>}
              {website && <li><a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-hero-fg/90 underline-offset-4 hover:text-hero-fg hover:underline"><Globe className="h-4 w-4" />{website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></li>}
              {phone && <li><a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={linkCls}><Phone className="h-4 w-4" />{phone}</a></li>}
              {address && <li className="flex gap-2 text-hero-fg/80"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{address}</span></li>}
            </ul>
            {(linkedin || instagram || youtube) && (
              <div className="flex gap-3 pt-1">
                {linkedin && <a href={linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn" className={linkCls}><Linkedin className="h-5 w-5" /></a>}
                {instagram && <a href={instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className={linkCls}><Instagram className="h-5 w-5" /></a>}
                {youtube && <a href={youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className={linkCls}><Youtube className="h-5 w-5" /></a>}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-hero-fg/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-hero-fg/80 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {tenant.name}. All rights reserved.</span>
          <a href="#top" className="hover:text-hero-fg hover:underline">Back to top ↑</a>
        </div>
      </div>
    </footer>
  );
}
