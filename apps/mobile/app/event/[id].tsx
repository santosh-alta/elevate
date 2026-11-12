import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Alert, Image, Pressable, Share, Text, View } from "react-native";
import { AWARD_LABELS, Api, EventDetail, EventFee, Faq, ProblemStatement, Registration, Sponsor, eventLabel, formatMoney } from "../../src/api";
import { HtmlContent } from "../../src/html";
import { TagChips, modeLabel, statusTone } from "../../src/events";
import { useSession } from "../../src/session";
import { STATUS_COLORS, withAlpha } from "../../src/theme";
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

function priceLines(fee: EventFee): { main: string; sub?: string } {
  const unit = fee.feeType === "PER_TEAM" ? "per team" : "per person";
  const early =
    fee.earlyBirdAmount != null && fee.earlyBirdEndsAt && new Date(fee.earlyBirdEndsAt).getTime() > Date.now() && fee.earlyBirdAmount < fee.amount;
  if (early)
    return {
      main: `${formatMoney(fee.earlyBirdAmount!, fee.currency)} ${unit} · early bird`,
      sub: `Until ${formatDate(fee.earlyBirdEndsAt, false)}, then ${formatMoney(fee.amount, fee.currency)}`,
    };
  return { main: `${formatMoney(fee.currentAmount || fee.amount, fee.currency)} ${unit}` };
}

function ProblemItem({ ps }: { ps: ProblemStatement }) {
  const { theme } = useSession();
  const [open, setOpen] = useState(false);
  const expandable = !!ps.html || ps.attachments.length > 0;
  return (
    <Card onPress={expandable ? () => setOpen((v) => !v) : undefined} style={{ gap: 8 }}>
      <Row style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Row style={{ flexWrap: "wrap" }}>
            {ps.code ? <Badge label={ps.code} tone="primary" /> : null}
            {ps.difficulty ? <Badge label={humanize(ps.difficulty)} /> : null}
          </Row>
          <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>{ps.title}</Text>
          {ps.sponsorName ? <Muted style={{ fontSize: 12 }}>Sponsored by {ps.sponsorName}</Muted> : null}
        </View>
        {expandable ? <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.muted} /> : null}
      </Row>
      {open ? (
        <>
          <HtmlContent html={ps.html} compact />
          {ps.attachments.length ? (
            <Row style={{ flexWrap: "wrap" }}>
              {ps.attachments.map((a, i) => (
                <Button key={`${a.url}-${i}`} title={a.label} icon="attach" variant="secondary" size="sm" onPress={() => openUrl(a.url)} />
              ))}
            </Row>
          ) : null}
        </>
      ) : null}
    </Card>
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
  const fee = event.fee;
  const price = fee ? priceLines(fee) : null;
  const isTeamEvent = !!event.modules?.teams;
  const teamAtRegistration = isTeamEvent && event.config?.teamRegistration !== "JOIN_LATER";
  // Razorpay checkout and team sign-up (adding members) are web-only for now.
  const registerOnWeb = !!fee || teamAtRegistration;
  const registerUrl = Api.registerOnWebUrl(event.slug);
  const pendingPayment = mine?.status === "PENDING_PAYMENT";
  const paidPayment = event.myPayment && event.myPayment.status === "PAID" ? event.myPayment : null;

  async function openOnWeb(url: string | null) {
    if (!url) {
      Alert.alert("Not available in the app", "Please register from the event website.");
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } finally {
      reload();
    }
  }

  async function openReceipt(paymentId: string) {
    try {
      await Api.openReceipt(paymentId);
    } catch (e: any) {
      Alert.alert("Couldn't open receipt", e?.message ?? "Try again later.");
    }
  }
  const registrations = event.counts?.registrations ?? event._count?.registrations;

  async function register() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await Api.register(event.id);
      await reload();
      if (res.payment && res.payment.status !== "PAID") {
        // The server decided this seat needs paying for: hand over to the web checkout.
        await openOnWeb(Api.registerOnWebUrl(event.slug));
        return;
      }
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
  const winners = event.winners;
  const gallery = event.gallery ?? [];
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
          title: eventLabel(event),
          headerRight: () => (
            <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share event" hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="share-outline" size={22} color={theme.colors.heroFg} />
            </Pressable>
          ),
        }}
      />
      {event.coverImageUrl ? (
        <Image source={{ uri: event.coverImageUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
      ) : (
        <View style={{ height: 120, backgroundColor: theme.colors.heroBg, justifyContent: "flex-end" }}>
          <View style={{ flexDirection: "row", height: 4 }}>
            <View style={{ flex: 1, backgroundColor: theme.gradient?.[0] ?? theme.colors.accent }} />
            <View style={{ flex: 1, backgroundColor: theme.gradient?.[1] ?? theme.colors.secondary }} />
          </View>
        </View>
      )}

      <View style={{ padding: 16 }}>
        <Row style={{ flexWrap: "wrap", marginBottom: 8 }}>
          <Badge label={eventLabel(event)} tone="primary" />
          <Badge label={humanize(event.status)} tone={statusTone(event.status)} />
          <Badge label={event.scope === "CENTRAL" ? "Central" : "Campus"} />
        </Row>
        <Text style={{ fontSize: 26, fontWeight: "800", color: theme.colors.fg }}>{event.title}</Text>
        {event.tagline ? <Muted style={{ marginTop: 4, fontSize: 16 }}>{event.tagline}</Muted> : null}
        {event.tags?.length ? (
          <View style={{ marginTop: 10 }}>
            <TagChips tags={event.tags} />
          </View>
        ) : null}

        <Card style={{ marginTop: 16, gap: 10 }}>
          <Row>
            <Ionicons name="calendar-outline" size={18} color={theme.colors.accent} />
            <Body>{formatDate(event.startsAt)}</Body>
          </Row>
          <Row>
            <Ionicons name="flag-outline" size={18} color={theme.colors.accent} />
            <Body>Ends {formatDate(event.endsAt)}</Body>
          </Row>
          <Row>
            <Ionicons name={event.mode === "ONLINE" ? "videocam-outline" : "location-outline"} size={18} color={theme.colors.accent} />
            <Body style={{ flex: 1 }}>{modeLabel(event)}</Body>
          </Row>
          {registrations !== undefined ? (
            <Row>
              <Ionicons name="people-outline" size={18} color={theme.colors.accent} />
              <Body>
                {registrations} registered{event.capacity ? ` · ${event.capacity} seats` : ""}
              </Body>
            </Row>
          ) : null}
          {price ? (
            <Row style={{ alignItems: "flex-start" }}>
              <Ionicons name="pricetag-outline" size={18} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: "700" }}>{price.main}</Body>
                {price.sub ? <Muted style={{ fontSize: 13 }}>{price.sub}</Muted> : null}
              </View>
            </Row>
          ) : canRegister ? (
            <Row>
              <Ionicons name="pricetag-outline" size={18} color={theme.colors.accent} />
              <Body>Free</Body>
            </Row>
          ) : null}
          {isTeamEvent && (event.config?.minTeamSize || event.config?.maxTeamSize) ? (
            <Row>
              <Ionicons name="people-circle-outline" size={18} color={theme.colors.accent} />
              <Body>
                Teams of {String(event.config?.minTeamSize ?? 1)}–{String(event.config?.maxTeamSize ?? event.config?.minTeamSize ?? 1)}
              </Body>
            </Row>
          ) : null}
          {event.submissionsCloseAt ? (
            <Row>
              <Ionicons name="cloud-upload-outline" size={18} color={theme.colors.accent} />
              <Body style={{ flex: 1 }}>Submissions close {formatDate(event.submissionsCloseAt)}</Body>
            </Row>
          ) : null}
          {event.registrationClosesAt ? (
            <Row>
              <Ionicons name="hourglass-outline" size={18} color={theme.colors.accent} />
              <Body>Registration closes {formatDate(event.registrationClosesAt)}</Body>
            </Row>
          ) : null}
          {event.venueMapUrl ? (
            <Pressable onPress={() => openUrl(event.venueMapUrl!)} accessibilityRole="link">
              <Row>
                <Ionicons name="map-outline" size={18} color={theme.colors.accent} />
                <Body style={{ flex: 1, color: theme.colors.primary, fontWeight: "600" }}>Open venue in Maps</Body>
              </Row>
            </Pressable>
          ) : null}
          {event.livestreamUrl ? (
            <Pressable onPress={() => openUrl(event.livestreamUrl!)} accessibilityRole="link">
              <Row>
                <Ionicons name="radio-outline" size={18} color={theme.colors.accent} />
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

        {mine && pendingPayment ? (
          <Card style={{ borderColor: STATUS_COLORS.warning, gap: 12 }}>
            <Row>
              <Ionicons name="card-outline" size={22} color={STATUS_COLORS.warning} />
              <Text style={{ flex: 1, fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>Payment pending</Text>
              <Badge label="Pending payment" tone="warning" />
            </Row>
            <Muted>
              Your seat is held for a short time. Complete the payment on the website to confirm your registration
              {event.myPayment?.amount ? ` (${formatMoney(event.myPayment.amount, event.myPayment.currency)})` : ""}.
            </Muted>
            <Button variant="cta" title="Complete payment" icon="card" onPress={() => openOnWeb(registerUrl)} />
            {isTeamEvent ? <Button title="My team" icon="people" variant="secondary" onPress={() => router.push(`/team/${event.id}`)} /> : null}
          </Card>
        ) : mine ? (
          <Card style={{ borderColor: theme.colors.primary, gap: 12 }}>
            <Row>
              <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
              <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>
                You're {mine.status === "CHECKED_IN" ? "checked in" : "registered"}
              </Text>
              <Badge label={humanize(mine.status)} tone="primary" />
            </Row>
            <Button title="Show my ticket" icon="qr-code" onPress={() => router.push("/(tabs)/tickets")} />
            {isTeamEvent || event.myTeam ? (
              <Button title="My team" icon="people" variant="secondary" onPress={() => router.push(`/team/${event.id}`)} />
            ) : null}
            {event.meetingUrl ? (
              <Button title="Join online" icon="videocam" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(event.meetingUrl!)} />
            ) : null}
            {paidPayment ? (
              <Button
                title={`Receipt${paidPayment.receiptNo ? ` ${paidPayment.receiptNo}` : ""}`}
                icon="receipt-outline"
                variant="ghost"
                onPress={() => openReceipt(paidPayment.id)}
              />
            ) : null}
            {mine.status !== "CHECKED_IN" && new Date(event.startsAt).getTime() - Date.now() < 6 * 3600_000 && new Date(event.endsAt) > new Date() && event.mode !== "ONLINE" ? (
              <Button title="Scan the venue QR to check in" icon="scan" variant="cta" onPress={() => router.push("/attend")} />
            ) : null}
            {new Date(event.startsAt) <= new Date() && event.status !== "CANCELLED" ? (
              <Button title="Give feedback" icon="chatbubble-ellipses-outline" variant="secondary" onPress={() => router.push(`/feedback/${event.id}`)} />
            ) : null}
            {mine.status !== "CHECKED_IN" && new Date(event.startsAt) > new Date() ? (
              <Button title="Cancel registration" variant="ghost" onPress={cancel} disabled={busy} />
            ) : null}
          </Card>
        ) : canRegister && registerOnWeb ? (
          <Card style={{ gap: 10 }}>
            <Button
              title={fee ? `Register on web · ${formatMoney(fee.currentAmount || fee.amount, fee.currency)}` : "Register your team on web"}
              icon="open-outline"
              size="lg"
              variant="cta"
              onPress={() => openOnWeb(registerUrl)}
            />
            <Muted style={{ fontSize: 13, textAlign: "center" }}>
              {fee && teamAtRegistration
                ? "Team details and payment are completed on the website. Your ticket shows up here afterwards."
                : fee
                  ? "Payment is completed securely on the website. Your ticket shows up here afterwards."
                  : "Add your team members on the website. Your ticket shows up here afterwards."}
            </Muted>
          </Card>
        ) : canRegister ? (
          <Button variant="cta" title="Register now" icon="ticket" size="lg" onPress={register} loading={busy} style={{ marginBottom: 12 }} />
        ) : (
          <Card>
            <Muted>
              {event.status === "ANNOUNCED"
                ? `Registrations open ${event.registrationOpensAt ? formatDate(event.registrationOpensAt) : "soon"}.`
                : "Registrations are closed for this event."}
            </Muted>
          </Card>
        )}

        {event.parentEvent ? (
          <Card onPress={() => router.push(`/event/${event.parentEvent!.id ?? event.parentEvent!.slug}`)}>
            <Row>
              <Ionicons name="albums-outline" size={18} color={theme.colors.accent} />
              <Body style={{ flex: 1 }}>
                Part of <Text style={{ fontWeight: "700" }}>{event.parentEvent.title}</Text>
              </Body>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
            </Row>
          </Card>
        ) : null}

        {winners.length > 0 ? (
          <>
            <SectionHeader>Winners</SectionHeader>
            {winners.map((w) => {
              const top = w.award === "WINNER";
              return (
                <Card key={w.teamId} style={{ gap: 6, borderColor: top ? STATUS_COLORS.warning : theme.colors.border }}>
                  <Row>
                    <Ionicons name={w.award === "SPECIAL_MENTION" ? "star" : "trophy"} size={20} color={top ? STATUS_COLORS.warning : theme.colors.primary} />
                    <Text style={{ flex: 1, fontWeight: "800", fontSize: 16, color: theme.colors.fg }}>{w.teamName}</Text>
                    <Badge label={AWARD_LABELS[w.award ?? ""] ?? (w.rank ? `#${w.rank}` : humanize(w.award))} tone={top ? "warning" : "primary"} />
                  </Row>
                  {w.projectTitle ? <Body>{w.projectTitle}</Body> : null}
                  {w.members.length ? <Muted>{w.members.map((m) => m.name).filter(Boolean).join(", ")}</Muted> : null}
                </Card>
              );
            })}
          </>
        ) : null}

        {event.description ? (
          <>
            <SectionHeader>About</SectionHeader>
            <HtmlContent html={event.description} />
          </>
        ) : null}

        {event.pageSections.map((sec) =>
          sec.html.trim() ? (
            <View key={sec.id}>
              <SectionHeader>{sec.title}</SectionHeader>
              <Card>
                <HtmlContent html={sec.html} />
              </Card>
            </View>
          ) : null,
        )}

        {event.subEvents.length > 0 ? (
          <>
            <SectionHeader>Events in this fest</SectionHeader>
            {event.subEvents.map((se) => (
              <Card key={se.id} onPress={() => router.push(`/event/${se.id}`)}>
                <Row style={{ gap: 12 }}>
                  {se.coverImageUrl ? (
                    <Image source={{ uri: se.coverImageUrl }} style={{ width: 56, height: 56, borderRadius: 10 }} />
                  ) : (
                    <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: withAlpha(theme.colors.primary, 0.12), alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="sparkles-outline" size={22} color={theme.colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontWeight: "700", color: theme.colors.fg }}>{se.title}</Text>
                    <Muted style={{ fontSize: 13 }}>
                      {eventLabel(se)} · {formatDate(se.startsAt)}
                    </Muted>
                    <Badge label={humanize(se.status)} tone={statusTone(se.status)} />
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
                </Row>
              </Card>
            ))}
          </>
        ) : null}

        {event.problemStatements.length > 0 ? (
          <>
            <SectionHeader>Problem statements</SectionHeader>
            {event.problemStatements.map((ps) => (
              <ProblemItem key={ps.id} ps={ps} />
            ))}
          </>
        ) : null}

        {event.rubricPublic.length > 0 ? (
          <>
            <SectionHeader>How you'll be judged</SectionHeader>
            <Card style={{ gap: 10 }}>
              {event.rubricPublic.map((c, i) => (
                <View key={`${c.name}-${i}`} style={{ gap: 2 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Text style={{ flex: 1, fontWeight: "700", color: theme.colors.fg }}>{c.name}</Text>
                    <Muted style={{ fontSize: 12 }}>
                      {c.roundName ? `${c.roundName} · ` : ""}out of {c.maxScore}
                      {c.weight !== 1 ? ` · ×${c.weight}` : ""}
                    </Muted>
                  </Row>
                  {c.description ? <Muted style={{ fontSize: 13 }}>{c.description}</Muted> : null}
                </View>
              ))}
            </Card>
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

        {gallery.length > 0 ? (
          <>
            <SectionHeader
              right={
                <Text onPress={() => router.push(`/gallery/${event.id}`)} style={{ color: theme.colors.primary, fontWeight: "700" }}>
                  See all
                </Text>
              }
            >
              Photos
            </SectionHeader>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {gallery.slice(0, 6).map((m, i) => (
                <Pressable
                  key={m.id}
                  onPress={() => router.push({ pathname: "/gallery/[eventId]", params: { eventId: event.id, start: String(i) } })}
                  style={{ width: "32.4%", aspectRatio: 1 }}
                  accessibilityLabel={m.caption ?? m.title ?? "Event photo"}
                >
                  <Image source={{ uri: m.url }} style={{ width: "100%", height: "100%", borderRadius: 6 }} />
                </Pressable>
              ))}
            </View>
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
                    <Ionicons name="mail-outline" size={18} color={theme.colors.accent} />
                    <Body style={{ color: theme.colors.primary, fontWeight: "600" }}>{event.contactEmail}</Body>
                  </Row>
                </Pressable>
              ) : null}
              {event.contactPhone ? (
                <Pressable onPress={() => openUrl(`tel:${event.contactPhone!.replace(/\s+/g, "")}`)} accessibilityRole="link">
                  <Row>
                    <Ionicons name="call-outline" size={18} color={theme.colors.accent} />
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
