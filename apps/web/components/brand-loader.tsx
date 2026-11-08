/** Loading screen: the brand mark breathing inside a spinning brand-gradient ring. Uses --brand-mark from the root layout. */
export function BrandLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="brand-loader flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative h-20 w-20">
        <div className="brand-loader-ring absolute inset-0 rounded-full" />
        <div
          className="brand-loader-mark absolute inset-[14px] rounded-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: "var(--brand-mark, none)" }}
        />
      </div>
      <span className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">{label}</span>
    </div>
  );
}
