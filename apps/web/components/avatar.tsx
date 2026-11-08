/** Profile photo, or initials on the brand colour when there is none. */
export function Avatar({ name, url, size = 32, className = "" }: { name: string; url?: string | null; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" referrerPolicy="no-referrer" style={style} className={`shrink-0 rounded-full object-cover ring-1 ring-border ${className}`} />
  ) : (
    <span aria-hidden style={style} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-fg ${className}`}>{initials}</span>
  );
}
