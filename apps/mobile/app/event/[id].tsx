import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import { Api, EventDetail, Registration } from "../../src/api";
import { modeLabel, statusTone } from "../../src/events";
import { useSession } from "../../src/session";
import { withAlpha } from "../../src/theme";
import {
  Badge,
  Body,
  Button,
  Card,
  ErrorBanner,
  Loading,
  Muted,
  Row,
  Screen,
  SectionHeader,
  formatDate,
  humanize,
  useFocusData,
} from "../../src/ui";


export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme, isStaff, canCheckin } = useSession();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh, reload } = useFocusData(async () => {
    const [event, regs] = await Promise.all([Api.event(id), Api.myRegistrations().catch(() => [] as Registration[])]);
    const mine = regs.find((r) => r.eventId === event.id && r.status !== "CANCELLED") ?? null;
    return { event, mine };
  }, [id]);

  if (loading) return <Loading />;
  if (!data) return <Screen edges={[]}>{error ? <ErrorBanner message={error} onRetry={refresh} /> : null}</Screen>;

  const { event, mine } = data;
  const canRegister = event.status === "REGISTRATION_OPEN";
  const registrations = event.counts?.registrations ?? event._count?.registrations;

  async function register() {
    setBusy(true);
    setActionError(null);
    try {
      await Api.register(event.id);
      await reload();
      router.push("/(tabs)/tickets");
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    Alert.alert("Cancel registration?", "You can register again while registrations are open.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel registration",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await Api.cancelRegistration(event.id);
            await reload();
          } catch (e: any) {
            setActionError(e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={refresh} padded={false}>
      <Stack.Screen options={{ title: humanize(event.type) }} />
      {event.coverImageUrl ? (
        <Image source={{ uri: event.coverImageUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
      ) : (
        <View style={{ height: 120, backgroundColor: withAlpha(theme.colors.primary, 0.12) }} />
      )}

      <View style={{ padding: 16 }}>
        <Row style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <Badge label={humanize(event.type)} tone="primary" />
          <Badge label={humanize(event.status)} tone={statusTone(event.status)} />
          <Badge label={event.scope === "CENTRAL" ? "Central" : "Campus"} />
        </Row>
        <Text style={{ fontSize: 26, fontWeight: "800", color: theme.colors.fg }}>{event.title}</Text>
        {event.tagline ? <Muted style={{ marginTop: 4, fontSize: 16 }}>{event.tagline}</Muted> : null}

        <Card style={{ marginTop: 16, gap: 10 }}>
          <Row>
            <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
            <Body>{formatDate(event.startsAt)}</Body>
          </Row>
          <Row>
            <Ionicons name="flag-outline" size={18} color={theme.colors.primary} />
            <Body>Ends {formatDate(event.endsAt)}</Body>
          </Row>
          <Row>
            <Ionicons name={event.mode === "ONLINE" ? "videocam-outline" : "location-outline"} size={18} color={theme.colors.primary} />
            <Body style={{ flex: 1 }}>{modeLabel(event)}</Body>
          </Row>
          {registrations !== undefined ? (
            <Row>
              <Ionicons name="people-outline" size={18} color={theme.colors.primary} />
              <Body>
                {registrations} registered{event.capacity ? ` · ${event.capacity} seats` : ""}
              </Body>
            </Row>
          ) : null}
          {event.registrationClosesAt ? (
            <Row>
              <Ionicons name="hourglass-outline" size={18} color={theme.colors.primary} />
              <Body>Registration closes {formatDate(event.registrationClosesAt)}</Body>
            </Row>
          ) : null}
        </Card>

        {actionError ? <ErrorBanner message={actionError} /> : null}

        {mine ? (
          <Card style={{ borderColor: theme.colors.primary, gap: 12 }}>
            <Row>
              <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
              <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>
                You're {mine.status === "CHECKED_IN" ? "checked in" : "registered"}
              </Text>
              <Badge label={humanize(mine.status)} tone="primary" />
            </Row>
            <Button title="Show my ticket" icon="qr-code" onPress={() => router.push("/(tabs)/tickets")} />
            {event.meetingUrl ? (
              <Button title="Join online" icon="videocam" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(event.meetingUrl!)} />
            ) : null}
            {mine.status !== "CHECKED_IN" ? (
              <Button title="Cancel registration" variant="ghost" onPress={cancel} disabled={busy} />
            ) : null}
          </Card>
        ) : canRegister ? (
          <Button title="Register now" icon="ticket" size="lg" onPress={register} loading={busy} style={{ marginBottom: 12 }} />
        ) : (
          <Card>
            <Muted>
              {event.status === "ANNOUNCED"
                ? `Registrations open ${event.registrationOpensAt ? formatDate(event.registrationOpensAt) : "soon"}.`
                : "Registrations are closed for this event."}
            </Muted>
          </Card>
        )}

        {event.modules?.teams && mine ? (
          <Card>
            <Row>
              <Ionicons name="people" size={18} color={theme.colors.primary} />
              <Body style={{ flex: 1 }}>Team event: create or join your team on the event website with an invite code.</Body>
            </Row>
          </Card>
        ) : null}

        {event.description ? (
          <>
            <SectionHeader>About</SectionHeader>
            <Body>{event.description}</Body>
          </>
        ) : null}

        {event.sessions && event.sessions.length > 0 ? (
          <>
            <SectionHeader>Agenda</SectionHeader>
            {event.sessions.map((s) => (
              <Card key={s.id} style={{ gap: 4 }}>
                <Text style={{ fontWeight: "700", color: theme.colors.fg }}>{s.title}</Text>
                <Muted>
                  {formatDate(s.startsAt)}
                  {s.speaker ? ` · ${s.speaker}` : ""}
                  {s.location ? ` · ${s.location}` : ""}
                </Muted>
              </Card>
            ))}
          </>
        ) : null}

        {event.guests && event.guests.length > 0 ? (
          <>
            <SectionHeader>Speakers & guests</SectionHeader>
            {event.guests.map((g) => (
              <Card key={g.id}>
                <Row style={{ gap: 12 }}>
                  {g.photoUrl ? (
                    <Image source={{ uri: g.photoUrl }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                  ) : (
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        backgroundColor: withAlpha(theme.colors.primary, 0.12),
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: theme.colors.primary, fontWeight: "800", fontSize: 18 }}>{g.name.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", color: theme.colors.fg }}>{g.name}</Text>
                    <Muted>{[g.designation, g.organization].filter(Boolean).join(", ")}</Muted>
                  </View>
                  {g.role ? <Badge label={humanize(g.role)} /> : null}
                </Row>
              </Card>
            ))}
          </>
        ) : null}

        {isStaff || canCheckin ? (
          <>
            <SectionHeader>Staff</SectionHeader>
            <Button title="Open event ops" icon="construct" variant="secondary" onPress={() => router.push(`/ops/${event.id}`)} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}
