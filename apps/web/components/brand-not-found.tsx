/** Shown when the address doesn’t belong to any brand, or the server can’t be reached. */
export function BrandNotFound({ host }: { host: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">This site isn&apos;t set up yet</h1>
        <p className="mt-3 text-muted">
          We couldn&apos;t find an events site for <span className="font-mono text-fg">{host || "this domain"}</span>, or the
          service is temporarily unavailable. Please check the address or try again in a few minutes.
        </p>
      </div>
    </main>
  );
}
