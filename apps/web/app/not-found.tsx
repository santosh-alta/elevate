import Link from "next/link";
import { BrandRoot } from "@/components/brand-root";

/**
 * Last-resort 404 for addresses outside the site areas. It must not read the request: Next.js prepares it
 * alongside every page, and reading headers here would stop the public pages from being pre-built.
 */
export default function NotFound() {
  return (
    <BrandRoot tenant={null}>
      <main className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm font-semibold text-primary">404</p>
          <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
          <p className="mt-2 text-muted">The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
          <Link href="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">← Back to events</Link>
        </div>
      </main>
    </BrandRoot>
  );
}
