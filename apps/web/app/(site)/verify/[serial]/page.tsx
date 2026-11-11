import type { Metadata } from "next";
import { getOrigin, getTenant } from "@/lib/tenant";
import { sharePreview } from "@/lib/brand-meta";
import { BadgeCheck, ShieldX } from "lucide-react";
import { apiGet } from "@/lib/api";
import { fmtDate, humanize } from "@/lib/format";
import type { VerifyResult } from "@/lib/types";
import { Card, LinkButton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const [tenant, origin] = await Promise.all([getTenant(), getOrigin()]);
  const short = tenant?.name.split(" ")[0] ?? "";
  return { title: "Verify certificate", ...sharePreview(tenant, origin, "verify", `Verify a certificate · ${short}`) };
}

export default async function VerifyPage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const r = await apiGet<VerifyResult>(`/verify/${encodeURIComponent(serial)}`);
  const brand = typeof r?.brand === "string" ? r.brand : r?.brand?.name;
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-lg p-8 text-center">
        {r?.valid ? (
          <>
            <BadgeCheck className="mx-auto h-14 w-14 text-emerald-600" />
            <h1 className="mt-4 text-2xl font-semibold">Verified certificate</h1>
            <p className="mt-2 text-muted">This certificate was issued by {brand ?? "us"} and is genuine.</p>
            <dl className="mt-6 space-y-3 rounded-brand bg-bg p-5 text-left text-sm">
              <Row k="Awarded to" v={r.recipientName} />
              <Row k="Certificate" v={r.type ? humanize(r.type) : undefined} />
              {r.detail && <Row k="Detail" v={r.detail} />}
              <Row k="Event" v={r.event?.title} />
              <Row k="Issued on" v={fmtDate(r.issuedAt)} />
              <Row k="Certificate ID" v={<span className="font-mono">{serial}</span>} />
            </dl>
            <div className="mt-6"><LinkButton href={`/api/proxy/certificates/${serial}.pdf`} external variant="outline" size="sm">View certificate PDF</LinkButton></div>
          </>
        ) : (
          <>
            <ShieldX className="mx-auto h-14 w-14 text-red-500" />
            <h1 className="mt-4 text-2xl font-semibold">Certificate not found</h1>
            <p className="mt-2 text-muted">No valid certificate matches <span className="font-mono text-fg">{serial}</span>. It may have been revoked or the ID is mistyped.</p>
          </>
        )}
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v ?? "—"}</dd></div>;
}
