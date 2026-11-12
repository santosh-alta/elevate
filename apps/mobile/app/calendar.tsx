import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api, CalendarEvent, ExternalEvent, WEB_BASE, brand, eventLabel } from "../src/api";
import { useSession } from "../src/session";
import { STATUS_COLORS, withAlpha } from "../src/theme";
import { Button, EmptyState, ErrorBanner, Loading, Muted, Screen, useFocusData } from "../src/ui";

/**
 * Calendar: our events (solid, register in the app) and major outside hackathons (dashed, marked External).
 * Tapping an outside one opens a preview card; "View & register" opens the organiser's site.
 */
const TZ = "Asia/Kolkata";
const dayKey = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
const fmt = (d: string, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => new Date(d).toLocaleDateString("en-IN", { timeZone: TZ, ...o });
const time = (d: string) => new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ });

type Entry = { kind: "own"; e: CalendarEvent } | { kind: "ext"; e: ExternalEvent; note: string };
type Show = "all" | "ours" | "external";

function daysLeft(d: string) {
  const ms = new Date(d).getTime() - Date.now();
  if (ms < 0) return { text: "Closed", urgent: false };
  const n = Math.floor(ms / 86_400_000);
  return n === 0 ? { text: "Closes today", urgent: true } : { text: n === 1 ? "1 day left" : `${n} days left`, urgent: n <= 3 };
}

export default function CalendarScreen() {
  const { theme, tenant } = useSession();
  const short = (tenant?.name ?? brand.appName).split(" ")[0];
  const [offset, setOffset] = useState(0);
  const [show, setShow] = useState<Show>("all");
  const [open, setOpen] = useState<ExternalEvent | null>(null);

  const month = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
  }, [offset]);
  const { data, error, loading, refreshing, refresh } = useFocusData(() => {
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    return Api.calendar(from, to);
  }, [offset]);

  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const today = dayKey(new Date());
  const days = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const add = (k: string, x: Entry) => k.startsWith(prefix) && map.set(k, [...(map.get(k) ?? []), x]);
    if (show !== "external") for (const e of data?.events ?? []) {
      for (let t = new Date(e.startsAt).getTime(), n = 0; t <= new Date(e.endsAt).getTime() && n < 40; t += 864e5, n++) add(dayKey(new Date(t)), { kind: "own", e });
    }
    if (show !== "ours") for (const e of data?.external ?? []) {
      const s = dayKey(e.startsAt), dl = dayKey(e.registrationEndsAt ?? e.endsAt);
      if (new Date(e.startsAt) >= new Date() || s === dl) add(s, { kind: "ext", e, note: s === dl ? "Deadline" : "Starts" });
      if (dl !== s) add(dl, { kind: "ext", e, note: e.registrationEndsAt ? "Apply by" : "Ends" });
    }
    return [...map.entries()].filter(([k]) => prefix !== today.slice(0, 7) || k >= today).sort(([a], [b]) => a.localeCompare(b));
  }, [data, show, prefix, today]);

  const chip = (key: Show, label: string) => {
    const active = show === key;
    return (
      <Pressable key={key} onPress={() => setShow(key)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : theme.colors.card }}>
        <Text style={{ color: active ? theme.colors.primaryFg : theme.colors.fg, fontWeight: "600" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={refresh}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Pressable onPress={() => setOffset((o) => o - 1)} hitSlop={10} style={{ padding: 8 }} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={22} color={theme.colors.fg} /></Pressable>
        <Pressable onPress={() => setOffset(0)}><Text style={{ fontSize: 20, fontWeight: "800", color: theme.colors.fg }}>{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</Text></Pressable>
        <Pressable onPress={() => setOffset((o) => o + 1)} hitSlop={10} style={{ padding: 8 }} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={22} color={theme.colors.fg} /></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
        {chip("all", "All")}{chip("ours", `${short} events`)}{chip("external", "Outside hackathons")}
      </ScrollView>
      <Muted style={{ fontSize: 12, marginBottom: 12 }}>Solid = {short} event, register here · Dashed = run by another organiser, tap for details</Muted>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {loading ? <Loading /> : !days.length ? (
        <EmptyState icon="calendar-outline" title="Nothing on these dates" message="Try the next month." />
      ) : days.map(([k, list]) => (
        <View key={k} style={{ marginBottom: 18 }}>
          <Text style={{ fontWeight: "800", fontSize: 16, color: k === today ? theme.colors.primary : theme.colors.fg, marginBottom: 8 }}>
            {k === today ? "Today · " : ""}{new Date(`${k}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })}
          </Text>
          {list.map((x) => x.kind === "own" ? (
            <Pressable key={`o${x.e.id}`} onPress={() => router.push(`/event/${x.e.id}`)} style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 14, marginBottom: 8, borderRadius: theme.radius ?? 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ width: 5, borderRadius: 3, backgroundColor: theme.colors.primary }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: theme.colors.accent }}>{short.toUpperCase()} · {eventLabel(x.e).toUpperCase()}</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.fg, marginTop: 2 }} numberOfLines={2}>{x.e.title}</Text>
                <Muted style={{ fontSize: 13, marginTop: 2 }}>
                  {dayKey(x.e.startsAt) === dayKey(x.e.endsAt) ? time(x.e.startsAt) : `${fmt(x.e.startsAt)} – ${fmt(x.e.endsAt)}`}
                  {" · "}{x.e.mode === "ONLINE" ? "Online" : x.e.venue ?? x.e.campuses?.map((c) => c.campus.city ?? c.campus.name).join(", ") ?? ""}
                </Muted>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} style={{ alignSelf: "center" }} />
            </Pressable>
          ) : (
            <Pressable key={`x${x.e.id}${x.note}`} onPress={() => setOpen(x.e)} style={({ pressed }) => ({ flexDirection: "row", gap: 12, padding: 14, marginBottom: 8, borderRadius: theme.radius ?? 12, backgroundColor: theme.colors.card, borderWidth: 1, borderStyle: "dashed", borderColor: "#f59e0b", opacity: pressed ? 0.85 : 1 })}>
              {x.e.imageUrl ? <Image source={{ uri: x.e.imageUrl }} style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: "#fff" }} resizeMode="contain" /> : (
                <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: "#fef3c7", alignItems: "center", justifyContent: "center" }}><Ionicons name="trophy" size={20} color="#d97706" /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: "#b45309" }}>EXTERNAL · {x.e.sourceLabel.toUpperCase()}{x.e.major ? " · 🏆 MAJOR" : ""}</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.fg, marginTop: 2 }} numberOfLines={2}>{x.e.title}</Text>
                <Muted style={{ fontSize: 13, marginTop: 2 }}>{x.note} · {x.e.prize ?? (x.e.mode === "ONLINE" ? "Online" : x.e.location ?? "")}</Muted>
              </View>
            </Pressable>
          ))}
        </View>
      ))}
      <Muted style={{ fontSize: 12, marginTop: 8 }}>Outside events come from Unstop, Devfolio, MLH, Devpost and the {short} team. Check details on the organiser's page before registering.</Muted>

      <ExternalSheet item={open} brand={short} onClose={() => setOpen(null)} />
    </Screen>
  );
}

function ExternalSheet({ item, brand: short, onClose }: { item: ExternalEvent | null; brand: string; onClose: () => void }) {
  const { theme } = useSession();
  if (!item) return null;
  const e = item;
  const deadline = e.registrationEndsAt ?? e.endsAt;
  const left = daysLeft(deadline);
  const stats: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: string; sub?: string; red?: boolean }[] = [
    { icon: "trophy-outline", label: "Prize pool", value: e.prize?.replace(/ in prizes$/, "") ?? "Certificates" },
    { icon: "people-outline", label: "Registered", value: e.participants ? e.participants.toLocaleString("en-IN") : "Open" },
    { icon: "alarm-outline", label: e.registrationEndsAt ? "Apply by" : "Deadline", value: fmt(deadline), sub: left.text, red: left.urgent },
    { icon: "calendar-outline", label: "Dates", value: fmt(e.startsAt) === fmt(e.endsAt) ? fmt(e.startsAt) : `${fmt(e.startsAt)} – ${fmt(e.endsAt)}` },
    { icon: e.mode === "ONLINE" ? "globe-outline" : "location-outline", label: "Where", value: e.mode === "ONLINE" ? "Online" : e.location ?? "In person" },
    ...(e.teamSize ? [{ icon: "people-circle-outline" as const, label: "Team", value: e.teamSize }] : []),
  ];
  const share = () => {
    const link = WEB_BASE ? `${WEB_BASE}/calendar?ext=${e.id}` : e.url;
    Share.share({ message: `${e.title}${e.prize ? ` · ${e.prize}` : ""} · apply by ${fmt(deadline)}\n${link}` }).catch(() => {});
  };
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(10,12,30,0.55)" }} onPress={onClose} />
      <SafeAreaView edges={["bottom"]} style={{ maxHeight: "88%", backgroundColor: theme.colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" }}>
        <View style={{ height: 120, backgroundColor: theme.colors.heroBg, justifyContent: "flex-end", padding: 16 }}>
          {e.coverUrl ? <Image source={{ uri: e.coverUrl }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" /> : null}
          <View style={{ position: "absolute", top: 14, left: 16, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: "#0f172a" }}>EXTERNAL · {e.sourceLabel.toUpperCase()}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={{ position: "absolute", top: 10, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          {e.imageUrl ? <Image source={{ uri: e.imageUrl }} style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: "#fff", borderWidth: 2, borderColor: "#fff" }} resizeMode="contain" /> : null}
        </View>
        <View style={{ height: 4, backgroundColor: theme.colors.accent }} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {e.major ? <Text style={{ backgroundColor: theme.colors.highlight, color: "#1f2937", fontWeight: "800", fontSize: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: "hidden" }}>🏆 Major</Text> : null}
            <Text style={{ backgroundColor: left.urgent ? STATUS_COLORS.dangerBg : STATUS_COLORS.successBg, color: left.urgent ? STATUS_COLORS.danger : STATUS_COLORS.success, fontWeight: "700", fontSize: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: "hidden" }}>{left.text}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 22, fontWeight: "800", color: theme.colors.fg }}>{e.title}</Text>
            {e.organizer ? <Muted>by {e.organizer}</Muted> : null}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {stats.map((s) => (
              <View key={s.label} style={{ width: "48.5%", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bg }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name={s.icon} size={14} color={theme.colors.accent} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.muted, textTransform: "uppercase" }}>{s.label}</Text>
                </View>
                <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.fg, marginTop: 4 }}>{s.value}</Text>
                {s.sub ? <Text style={{ fontSize: 12, color: s.red ? STATUS_COLORS.danger : STATUS_COLORS.success, fontWeight: "600" }}>{s.sub}</Text> : null}
              </View>
            ))}
          </View>
          {e.summary ? <Text style={{ color: theme.colors.fg, lineHeight: 21 }}>{e.summary}</Text> : null}
          {e.tags.length ? <Muted style={{ fontSize: 13 }}>{e.tags.join(" · ")}</Muted> : null}
          <Text style={{ fontSize: 12, color: theme.colors.muted, backgroundColor: withAlpha("#f59e0b", 0.12), padding: 10, borderRadius: 10, overflow: "hidden" }}>
            Organised by {e.organizer ?? "another organiser"} on {e.sourceLabel}, not by {short}. Check the rules and dates on their page before you register.
          </Text>
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <Button title={`View & register on ${e.sourceLabel}`} icon="open-outline" onPress={() => Linking.openURL(e.url)} style={{ flex: 1 }} />
          <Button title="" icon="share-social" variant="ghost" onPress={share} style={{ paddingHorizontal: 14 }} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
