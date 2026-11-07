import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Alert, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Api, Registration, formatMoney } from "../../src/api";
import { useSession } from "../../src/session";
import { STATUS_COLORS } from "../../src/theme";
import { Badge, Button, Card, EmptyState, ErrorBanner, Loading, Muted, Row, Screen, Title, formatDate, humanize, useFocusData } from "../../src/ui";

const ACTIVE = ["REGISTERED", "APPROVED", "WAITLISTED", "CHECKED_IN", "PENDING_PAYMENT"];
const TEAM_TYPES = ["HACKATHON", "COMPETITION", "STARTUP_PITCH"];

async function openReceipt(paymentId: string) {
  try {
    await Api.openReceipt(paymentId);
  } catch (e: any) {
    Alert.alert("Couldn't open receipt", e?.message ?? "Try again later.");
  }
}

function PendingPaymentCard({ r, onDone }: { r: Registration; onDone: () => void }) {
  const { theme } = useSession();
  const url = r.event ? Api.registerOnWebUrl(r.event.slug) : null;
  return (
    <Card style={{ gap: 10, borderColor: STATUS_COLORS.warning }}>
      <Row>
        <Ionicons name="card-outline" size={20} color={STATUS_COLORS.warning} />
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: theme.colors.fg }}>{r.event?.title ?? "Event"}</Text>
      </Row>
      {r.event ? <Muted>{formatDate(r.event.startsAt)}</Muted> : null}
      <Row style={{ flexWrap: "wrap" }}>
        <Badge label="Pending payment" tone="warning" />
        {r.payment?.amount ? <Badge label={formatMoney(r.payment.amount, r.payment.currency)} /> : null}
      </Row>
      <Muted>Your ticket appears here once the payment is complete. Unpaid seats are released after a short time.</Muted>
      <Button
        title="Complete payment"
        icon="card"
        onPress={async () => {
          if (!url) return Alert.alert("Not available", "Open the event on the website to complete the payment.");
          await WebBrowser.openBrowserAsync(url);
          onDone();
        }}
      />
    </Card>
  );
}

export default function TicketsScreen() {
  const { theme, user } = useSession();
  const { data, error, loading, refreshing, refresh, reload } = useFocusData(Api.myRegistrations);

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
          if (r.status === "PENDING_PAYMENT") return <PendingPaymentCard key={r.id} r={r} onDone={reload} />;
          const checkedIn = r.status === "CHECKED_IN";
          const paid = r.payment?.status === "PAID" ? r.payment : null;
          const receiptId = paid?.id ?? (r.payment ? null : r.paymentId);
          const teamEvent = !!r.teamId || TEAM_TYPES.includes(r.event?.type ?? "");
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
                {paid ? <Badge label={`Paid ${formatMoney(paid.amount, paid.currency)}`} tone="success" /> : null}
              </Row>
              <Muted>{user?.name}</Muted>
              {teamEvent || receiptId ? (
                <Row style={{ alignSelf: "stretch" }}>
                  {teamEvent && r.event ? (
                    <Button title="My team" icon="people" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => router.push(`/team/${r.event!.id}`)} />
                  ) : null}
                  {receiptId ? (
                    <Button title="Receipt" icon="receipt-outline" variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => openReceipt(receiptId)} />
                  ) : null}
                </Row>
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
