import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Api } from "../../src/api";
import { useSession } from "../../src/session";
import { Badge, Button, Card, EmptyState, ErrorBanner, Loading, Muted, Row, Screen, Title, formatDate, humanize, useFocusData } from "../../src/ui";

const ACTIVE = ["REGISTERED", "APPROVED", "WAITLISTED", "CHECKED_IN"];

export default function TicketsScreen() {
  const { theme, user } = useSession();
  const { data, error, loading, refreshing, refresh } = useFocusData(Api.myRegistrations);

  const regs = (data ?? [])
    .filter((r) => ACTIVE.includes(r.status))
    .sort((a, b) => new Date(a.event?.startsAt ?? 0).getTime() - new Date(b.event?.startsAt ?? 0).getTime());

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Title subtitle="Show the QR code at the entrance to check in.">My tickets</Title>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading />
      ) : regs.length === 0 ? (
        <EmptyState
          icon="ticket-outline"
          title="No tickets yet"
          message="Register for an event and your QR ticket will appear here."
          action={<Button title="Browse events" onPress={() => router.push("/(tabs)")} />}
        />
      ) : (
        regs.map((r) => {
          const checkedIn = r.status === "CHECKED_IN";
          return (
            <Card key={r.id} style={{ alignItems: "center", gap: 12 }} onPress={() => r.event && router.push(`/event/${r.event.id}`)}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.fg, textAlign: "center" }}>
                {r.event?.title ?? "Event"}
              </Text>
              {r.event ? <Muted>{formatDate(r.event.startsAt)}</Muted> : null}
              <View style={{ padding: 12, backgroundColor: "#fff", borderRadius: 12, opacity: checkedIn ? 0.35 : 1 }}>
                <QRCode value={r.ticketCode} size={200} color="#0f172a" backgroundColor="#ffffff" />
              </View>
              <Text selectable style={{ fontFamily: "monospace", color: theme.colors.muted, letterSpacing: 1 }}>
                {r.ticketCode}
              </Text>
              <Row>
                {checkedIn ? <Ionicons name="checkmark-circle" size={18} color="#16a34a" /> : null}
                <Badge label={humanize(r.status)} tone={checkedIn ? "success" : r.status === "WAITLISTED" ? "warning" : "primary"} />
              </Row>
              <Muted>{user?.name}</Muted>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
