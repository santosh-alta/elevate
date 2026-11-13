import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Api } from "../../src/api";
import { EventCard } from "../../src/events";
import { useSession } from "../../src/session";
import { withAlpha } from "../../src/theme";
import { Body, Card, EmptyState, ErrorBanner, Loading, Muted, Screen, SectionHeader, useFocusData } from "../../src/ui";

/** One campus: photo, numbers, about, upcoming events there and photos from past events. */
export default function CampusScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { theme } = useSession();
  const { data, error, loading, refreshing, refresh } = useFocusData(async () => {
    const campus = await Api.campus(String(code));
    const events = await Api.eventsByFamily(null, campus.id, true).catch(() => []);
    return { campus, events };
  }, [code]);

  if (loading) return <Loading />;
  if (error || !data) return <Screen edges={[]}><ErrorBanner message={error ?? "Couldn't load this campus"} onRetry={refresh} /></Screen>;
  const { campus, events } = data;
  const d = campus.details ?? {};
  const gallery = [
    ...((Array.isArray(d.gallery) ? d.gallery : []) as { url: string; caption?: string }[]).map((g) => ({ url: g.url, caption: g.caption ?? null, slug: null as string | null })),
    ...campus.eventPhotos.map((p) => ({ url: p.url, caption: p.eventTitle, slug: p.eventSlug })),
  ].filter((g, i, all) => g.url && g.url !== campus.photoUrl && all.findIndex((x) => x.url === g.url) === i).slice(0, 12);
  const stats = [
    { icon: "calendar" as const, value: campus.stats.eventsHeld, label: "Events held" },
    { icon: "people" as const, value: campus.stats.participants, label: "Participants" },
    { icon: "trophy" as const, value: campus.stats.hackathons, label: "Hackathons" },
  ];
  const mapsUrl = campus.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(campus.address)}` : null;

  return (
    <Screen edges={[]} padded={false} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: campus.city ?? "Campus" }} />
      {campus.photoUrl ? <Image source={{ uri: campus.photoUrl }} style={{ width: "100%", height: 210 }} resizeMode="cover" accessibilityLabel={campus.name} /> : null}
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: theme.colors.fg, letterSpacing: -0.4 }}>{campus.name}</Text>
        {[typeof d.programme === "string" ? d.programme : null, [campus.city, typeof d.state === "string" ? d.state : null].filter(Boolean).join(", ")].filter(Boolean).map((line) => (
          <Muted key={line as string} style={{ marginTop: 4 }}>{line}</Muted>
        ))}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {stats.map((s) => (
            <View key={s.label} style={{ flex: 1, padding: 12, borderRadius: theme.radius ?? 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
              <Ionicons name={s.icon} size={16} color={theme.colors.accent} />
              <Text style={{ fontSize: 20, fontWeight: "800", color: theme.colors.fg }}>{s.value.toLocaleString("en-IN")}</Text>
              <Muted style={{ fontSize: 12 }}>{s.label}</Muted>
            </View>
          ))}
        </View>

        {typeof d.about === "string" && d.about ? (<><SectionHeader>About</SectionHeader><Body>{d.about}</Body></>) : null}
        {campus.address ? (
          <Pressable onPress={() => mapsUrl && Linking.openURL(mapsUrl)} style={{ flexDirection: "row", gap: 8, marginTop: 14, alignItems: "flex-start" }} accessibilityRole="link">
            <Ionicons name="location" size={18} color={theme.colors.accent} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, color: theme.colors.fg, lineHeight: 20 }}>{campus.address} <Text style={{ color: theme.colors.accent, fontWeight: "600" }}>Open in Maps</Text></Text>
          </Pressable>
        ) : null}

        <SectionHeader>Upcoming at this campus</SectionHeader>
        {events.length === 0 ? (
          <EmptyState icon="calendar-outline" title="Nothing scheduled yet" message="New events at this campus will show up here." />
        ) : events.map((e) => <EventCard key={e.id} event={e} onPress={() => router.push(`/event/${e.id}`)} />)}

        {gallery.length ? (
          <>
            <SectionHeader>Photos</SectionHeader>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {gallery.map((g) => (
                <Pressable key={g.url} onPress={() => (g.slug ? router.push(`/event/${g.slug}`) : null)} disabled={!g.slug}>
                  <Image source={{ uri: g.url }} style={{ width: 220, height: 150, borderRadius: theme.radius ?? 12, backgroundColor: withAlpha(theme.colors.primary, 0.08) }} resizeMode="cover" accessibilityLabel={g.caption ?? "Campus photo"} />
                  {g.caption ? <Muted numberOfLines={1} style={{ width: 220, fontSize: 12, marginTop: 4 }}>{g.caption}</Muted> : null}
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {typeof d.websiteUrl === "string" && d.websiteUrl ? (
          <Card onPress={() => WebBrowser.openBrowserAsync(d.websiteUrl as string)} style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="globe-outline" size={20} color={theme.colors.accent} />
            <Text style={{ flex: 1, fontWeight: "600", color: theme.colors.fg }}>Programme and admissions</Text>
            <Ionicons name="open-outline" size={18} color={theme.colors.muted} />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
