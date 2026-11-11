import Link from "next/link";

/** 404 inside the site: shown with the brand's header, footer and colours (from the site layout). */
export default function SiteNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="text-center">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">Page not found</h1>
        <p className="mt-2 text-muted">The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="inline-flex h-10 items-center rounded-brand bg-primary px-4 text-sm font-medium text-primary-fg">Home</Link>
          <Link href="/events" className="inline-flex h-10 items-center rounded-brand px-4 text-sm font-medium text-primary ring-1 ring-inset ring-border hover:bg-primary/5">Browse events</Link>
        </div>
      </div>
    </div>
  );
}
