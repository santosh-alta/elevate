import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Alert, Image, Pressable, Share, Text, View } from "react-native";
import { Api, EventDetail, Faq, Registration, Sponsor, eventTypeLabel } from "../../src/api";
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

const SPONSOR_TIER_ORDER = ["TITLE", "GOLD", "SILVER", "PARTNER", "COMMUNITY"];

function openUrl(url: string) {
  if (/^https?:\/\//.test(url)) WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
  else Linking.openURL(url).catch(() => Alert.alert("Can't open link", url));
}

function FaqItem({ faq }: { faq: Faq }) {
  const { theme } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
    >
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Text style={{ flex: 1, fontWeight: "700", color: theme.colors.fg, fontSize: 15 }}>{faq.q}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.muted} />
      </Row>
      {open ? <Body style={{ marginTop: 8 }}>{faq.a}</Body> : null}
    </Pressable>
  );
}

function SponsorTile({ sponsor }: { sponsor: Sponsor }) {
  const { theme } = useSession();
  return (
    <Pressable
      onPress={sponsor.website ? () => openUrl(sponsor.website!) : undefined}
      disabled={!sponsor.website}
      accessibilityRole={sponsor.website ? "link" : undefined}
      style={{
        width: "48%",
        minHeight: 84,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 10,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {sponsor.logoUrl ? (
        <Image source={{ uri: sponsor.logoUrl }} style={{ width: "100%", height: 40 }} resizeMode="contain" accessibilityLabel={sponsor.name} />
      ) : (
        <Text style={{ fontWeight: "800", color: theme.colors.fg, textAlign: "center" }}>{sponsor.name}</Text>
      )}
      {sponsor.logoUrl ? <Muted style={{ fontSize: 12, textAlign: "center" }} numberOfLines={1}>{sponsor.name}</Muted> : null}
    </Pressable>
  );
}


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

  const publicUrl = Api.publicEventUrl(event.slug);

  async function share() {
    const when = formatDate(event.startsAt);
    const message = [event.title, event.tagline, when, publicUrl].filter(Boolean).join("\n");
    try {
      await Share.share(publicUrl ? { message, url: publicUrl, title: event.title } : { message, title: event.title });
    } catch {
      // user dismissed or sharing unavailable
    }
  }

  function addToCalendar() {
    // The .ics opens in the phone's calendar app (iOS) or a calendar picker (Android).
    Linking.openURL(Api.calendarUrl(event.slug || event.id)).catch(() =>
      Alert.alert("Couldn't open calendar", "Try again from the event website."),
    );
  }

  const guests = event.guests ?? [];
  const sponsors = (event.sponsors ?? [])
    .slice()
    .sort((a, b) => SPONSOR_TIER_ORDER.indexOf(a.tier ?? "PARTNER") - SPONSOR_TIER_ORDER.indexOf(b.tier ?? "PARTNER"));
  const sponsorTiers = [...new Set(sponsors.map((s) => s.tier ?? "PARTNER"))];
  const faqs = event.faqs ?? [];
  const isOver = new Date(event.endsAt).getTime() < Date.now();

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
      <Stack.Screen
        options={{
          title: eventTypeLabel(event.type),
          headerRight: () => (
            <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share event" hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="share-outline" size={22} color={theme.colors.primary} />
            </Pressable>
          ),
        }}
      />
      {event.coverImageUrl ? (
        <Image source={{ uri: event.coverImageUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
      ) : (
        <View style={{ height: 120, backgroundColor: withAlpha(theme.colors.primary, 0.12) }} />
      )}

      <View style={{ padding: 16 }}>
        <Row style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <Badge label={eventTypeLabel(event.type)} tone="primary" />
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
          {event.venueMapUrl ? (
            <Pressable onPress={() => openUrl(event.venueMapUrl!)} accessibilityRole="link">
              <Row>
                <Ionicons name="map-outline" size={18} color={theme.colors.primary} />
                <Body style={{ flex: 1, color: theme.colors.primary, fontWeight: "600" }}>Open venue in Maps</Body>
              </Row>
            </Pressable>
          ) : null}
          {event.livestreamUrl ? (
            <Pressable onPress={() => openUrl(event.livestreamUrl!)} accessibilityRole="link">
              <Row>
                <Ionicons name="radio-outline" size={18} color={theme.colors.primary} />
                <Body style={{ flex: 1, color: theme.colors.primary, fontWeight: "600" }}>Watch the livestream</Body>
              </Row>
            </Pressable>
          ) : null}
        </Card>

        {!isOver ? (
          <Row style={{ marginBottom: 12 }}>
            <Button title="Add to calendar" icon="calendar" variant="secondary" onPress={addToCalendar} style={{ flex: 1 }} />
            <Button title="Share" icon="share-social" variant="secondary" onPress={share} style={{ flex: 1 }} />
          </Row>
        ) : null}

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

        {guests.length > 0 ? (
          <>
            <SectionHeader>Speakers & guests</SectionHeader>
            {guests.map((g) => (
              <Card key={g.id} onPress={g.linkedinUrl ? () => openUrl(g.linkedinUrl!) : undefined}>
                <Row style={{ gap: 12, alignItems: "flex-start" }}>
                  {g.photoUrl ? (
                    <Image source={{ uri: g.photoUrl }} style={{ width: 60, height: 60, borderRadius: 30 }} accessibilityLabel={`Photo of ${g.name}`} />
                  ) : (
                    <View
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 30,
                        backgroundColor: withAlpha(theme.colors.primary, 0.12),
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: theme.colors.primary, fontWeight: "800", fontSize: 20 }}>{g.name.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Text style={{ flex: 1, fontWeight: "700", color: theme.colors.fg, fontSize: 16 }}>{g.name}</Text>
                      {g.role ? <Badge label={humanize(g.role)} /> : null}
                    </Row>
                    {g.designation || g.organization ? (
                      <Muted>{[g.designation, g.organization].filter(Boolean).join(", ")}</Muted>
                    ) : null}
                    {g.talkTitle ? (
                      <Text style={{ marginTop: 6, color: theme.colors.fg, fontWeight: "600", fontStyle: "italic" }}>“{g.talkTitle}”</Text>
                    ) : null}
                    {g.sessionAt ? <Muted style={{ fontSize: 12 }}>{formatDate(g.sessionAt)}</Muted> : null}
                    {g.linkedinUrl ? (
                      <Row style={{ marginTop: 4 }}>
                        <Ionicons name="logo-linkedin" size={14} color={theme.colors.primary} />
                        <Muted style={{ fontSize: 12, color: theme.colors.primary }}>View LinkedIn</Muted>
                      </Row>
                    ) : null}
                  </View>
                </Row>
              </Card>
            ))}
          </>
        ) : null}

        {sponsors.length > 0 ? (
          <>
            <SectionHeader>Sponsors & partners</SectionHeader>
            {sponsorTiers.map((tier) => (
              <View key={tier} style={{ marginBottom: 8 }}>
                {sponsorTiers.length > 1 ? <Muted style={{ fontSize: 12, fontWeight: "700", marginBottom: 6 }}>{humanize(tier)}</Muted> : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 }}>
                  {sponsors.filter((sp) => (sp.tier ?? "PARTNER") === tier).map((sp) => (
                    <SponsorTile key={sp.id} sponsor={sp} />
                  ))}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {faqs.length > 0 ? (
          <>
            <SectionHeader>FAQs</SectionHeader>
            <Card style={{ paddingVertical: 0 }}>
              {faqs.map((f, i) => (
                <FaqItem key={`${i}-${f.q}`} faq={f} />
              ))}
            </Card>
          </>
        ) : null}

        {event.contactEmail || event.contactPhone ? (
          <>
            <SectionHeader>Questions? Contact the organisers</SectionHeader>
            <Card style={{ gap: 12 }}>
              {event.contactEmail ? (
                <Pressable onPress={() => openUrl(`mailto:${event.contactEmail}`)} accessibilityRole="link">
                  <Row>
                    <Ionicons name="mail-outline" size={18} color={theme.colors.primary} />
                    <Body style={{ color: theme.colors.primary, fontWeight: "600" }}>{event.contactEmail}</Body>
                  </Row>
                </Pressable>
              ) : null}
              {event.contactPhone ? (
                <Pressable onPress={() => openUrl(`tel:${event.contactPhone!.replace(/\s+/g, "")}`)} accessibilityRole="link">
                  <Row>
                    <Ionicons name="call-outline" size={18} color={theme.colors.primary} />
                    <Body style={{ color: theme.colors.primary, fontWeight: "600" }}>{event.contactPhone}</Body>
                  </Row>
                </Pressable>
              ) : null}
            </Card>
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
