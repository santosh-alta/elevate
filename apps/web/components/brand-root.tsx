import type { CSSProperties, ReactNode } from "react";
import { resolveTheme } from "@elevate/shared";
import { googleFontHrefs, themeCss } from "@/lib/theme";
import type { Tenant } from "@/lib/types";

/** The brand's colours, fonts and logo mark (for the loader), wrapped around a layout's content. */
export function BrandRoot({ tenant, children }: { tenant: Tenant | null; children: ReactNode }) {
  const theme = resolveTheme(tenant?.theme);
  const fontHrefs = googleFontHrefs(theme);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss(tenant?.theme) }} />
      {theme.fontCssUrl && <link rel="stylesheet" href={theme.fontCssUrl} />}
      {fontHrefs.length > 0 && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          {fontHrefs.map((href) => <link key={href} rel="stylesheet" href={href} />)}
        </>
      )}
      <div className="contents" style={theme.iconUrl ? ({ "--brand-mark": `url("${theme.iconUrl}")` } as CSSProperties) : undefined}>
        {children}
      </div>
    </>
  );
}
