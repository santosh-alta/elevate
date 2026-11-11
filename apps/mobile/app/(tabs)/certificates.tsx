import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Linking, Text, View } from "react-native";
import { Api, CERTIFICATE_TYPE_LABELS, Certificate, brand } from "../../src/api";
import { useSession } from "../../src/session";
import { withAlpha } from "../../src/theme";
import { Badge, Button, Card, EmptyState, ErrorBanner, Loading, Muted, Row, Screen, Title, formatDate, humanize, useFocusData } from "../../src/ui";

const typeLabel = (type: string) => CERTIFICATE_TYPE_LABELS[type] ?? humanize(type);

/** LinkedIn "Add licence or certification" deep link. */
function addToLinkedInUrl(cert: Certificate, orgName: string, certUrl: string) {
  const issued = new Date(cert.issuedAt);
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: `${cert.event?.title ?? "Event"}: ${typeLabel(cert.type)}`,
    organizationName: orgName,
    issueYear: String(issued.getFullYear()),
    issueMonth: String(issued.getMonth() + 1),
    certUrl,
    certId: cert.serial,
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

export default function CertificatesScreen() {
  const { theme, tenant } = useSession();
  const { data, error, loading, refreshing, refresh } = useFocusData(Api.myCertificates);
  const certs = data ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Title subtitle="Issued automatically after each event.">Certificates</Title>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading />
      ) : certs.length === 0 ? (
        <EmptyState icon="ribbon-outline" title="No certificates yet" message="Attend an event and your certificate will appear here once it's completed." />
      ) : (
        certs.map((c) => {
          const pdf = c.pdfUrl ?? Api.certificatePdfUrl(c.serial);
          const winner = ["WINNER", "RUNNER_UP", "SPECIAL_MENTION"].includes(c.type);
          const finalist = c.type === "FINALIST";
          return (
            <Card key={c.id} style={{ gap: 10 }}>
              <Row style={{ gap: 12 }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: winner ? "#fef3c7" : finalist ? "#dcfce7" : withAlpha(theme.colors.primary, 0.12),
                  }}
                >
                  <Ionicons
                    name={winner ? "trophy" : finalist ? "medal" : "ribbon"}
                    size={24}
                    color={winner ? "#d97706" : finalist ? "#16a34a" : theme.colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>{c.event?.title ?? "Event"}</Text>
                  <Muted>{c.detail ?? typeLabel(c.type)}</Muted>
                </View>
              </Row>
              <Row style={{ justifyContent: "space-between" }}>
                <Badge label={typeLabel(c.type)} tone={winner ? "warning" : finalist ? "success" : "primary"} />
                <Muted style={{ fontSize: 12 }}>
                  #{c.serial} · {formatDate(c.issuedAt, false)}
                </Muted>
              </Row>
              <Row>
                <Button title="View PDF" icon="document-text" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => WebBrowser.openBrowserAsync(pdf)} />
                <Button
                  title="Add to LinkedIn"
                  icon="logo-linkedin"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => Linking.openURL(addToLinkedInUrl(c, tenant?.name ?? brand.appName, pdf))}
                />
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
