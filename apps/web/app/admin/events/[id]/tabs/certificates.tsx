import { Download } from "lucide-react";
import { apiGet, apiList } from "@/lib/api";
import { CertificateDesignEditor, type DesignMap } from "@/components/admin/certificate-design-editor";
import { fmtDate, humanize } from "@/lib/format";
import type { Certificate, ElevateEvent } from "@/lib/types";
import { Badge, Card, CardBody, CardHeader, EmptyState, LinkButton, Stat, Table, Td, Th } from "@/components/ui";
import { ApiButton } from "@/components/client/api-button";

export async function CertificatesTab({ event }: { event: ElevateEvent }) {
  const [certs, designs] = await Promise.all([
    apiList<Certificate>(`/events/${event.id}/certificates`),
    apiGet<{ event: DesignMap; brand: DesignMap }>(`/events/${event.id}/certificate-designs`),
  ]);
  const byType = certs.reduce<Record<string, number>>((m, c) => ((m[c.type] = (m[c.type] ?? 0) + 1), m), {});
  const ready = ["COMPLETED", "ARCHIVED", "JUDGING", "LIVE"].includes(event.status);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Issued" value={certs.length} />
        {Object.entries(byType).slice(0, 3).map(([t, n]) => <Stat key={t} label={humanize(t)} value={n} />)}
      </div>
      <Card>
        <CardHeader
          title="Certificates"
          description="Participation for everyone checked in; winner/runner-up from published results; judges, speakers and volunteers too. Safe to run again."
          action={<ApiButton path={`/events/${event.id}/certificates/generate`} confirm={ready ? undefined : "The event isn't live or completed yet. Generate anyway?"} successMessage="Generation started — refresh in a moment.">Generate certificates</ApiButton>}
        />
        {certs.length ? (
          <Table>
            <thead><tr><Th>Recipient</Th><Th>Type</Th><Th>Serial</Th><Th>Issued</Th><Th /></tr></thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id}>
                  <Td><p className="font-medium">{c.recipientName}</p>{c.detail && <p className="text-xs text-muted">{c.detail}</p>}</Td>
                  <Td><Badge tone={c.type === "PARTICIPATION" ? "gray" : "amber"}>{humanize(c.type)}</Badge></Td>
                  <Td className="font-mono text-xs">{c.serial}</Td>
                  <Td className="text-muted">{fmtDate(c.issuedAt)}</Td>
                  <Td><LinkButton href={`/api/proxy/certificates/${c.serial}.pdf`} external size="sm" variant="ghost"><Download className="h-4 w-4" /></LinkButton></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No certificates yet" description="They're generated automatically when the event is marked Completed, or click Generate." /></div>}
      </Card>
      <Card>
        <CardHeader title="Certificate design" description="Use the standard design, or upload this event's own artwork. We print the name, QR code, certificate ID and issue date on it." />
        <CardBody><CertificateDesignEditor eventId={event.id} initial={designs?.event ?? {}} inherited={designs?.brand ?? {}} /></CardBody>
      </Card>
    </div>
  );
}
