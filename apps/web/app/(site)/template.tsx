import type { ReactNode } from "react";

/** Re-mounts on every navigation, so each page fades and slides in. */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
