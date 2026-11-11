import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-left text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-primary/[0.03]", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("border-b border-border bg-bg/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted first:rounded-tl-brand last:rounded-tr-brand", className)} {...props} />;
}
export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border/70 px-4 py-3 align-middle text-fg", className)} {...props} />;
}
