import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Image, Text, View } from "react-native";
import { Api } from "../../src/api";
import { useSession } from "../../src/session";
import { withAlpha } from "../../src/theme";
import { Card, EmptyState, ErrorBanner, Loading, Muted, Screen, useFocusData } from "../../src/ui";

/** Every campus, with a photo and how many events are coming up there. */
export default function CampusesScreen() {
  const { theme, membership } = useSession();
  const { data, error, loading, refreshing, refresh } = useFocusData(() => Api.campuses(), []);
  // The person's own campus first, then A–Z.
  const campuses = [...(data ?? [])].sort((a, b) => Number(b.id === membership?.campusId) - Number(a.id === membership?.campusId));

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={refresh}>
      <Muted style={{ marginBottom: 14 }}>Tap a campus to see its events, photos and details.</Muted>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {loading ? <Loading /> : campuses.length === 0 ? (
        <EmptyState icon="business-outline" title="No campuses yet" />
      ) : campuses.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/campuses/${c.code}`)} style={{ padding: 0, overflow: "hidden" }}>
          {c.photoUrl ? (
            <Image source={{ uri: c.photoUrl }} style={{ width: "100%", height: 150 }} resizeMode="cover" accessibilityLabel={c.name} />
          ) : (
            <View style={{ height: 90, backgroundColor: theme.colors.heroBg, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="business-outline" size={34} color={theme.colors.accent} />
            </View>
          )}
          <View style={{ padding: 14, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: theme.colors.fg }}>{c.name}</Text>
              {c.id === membership?.campusId ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: withAlpha(theme.colors.secondary, 0.18) }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.fg }}>Your campus</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              {c.city ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Ionicons name="location-outline" size={14} color={theme.colors.muted} /><Muted>{c.city}</Muted></View> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Ionicons name="calendar-outline" size={14} color={theme.colors.accent} /><Muted>{c.upcoming} upcoming</Muted></View>
              {c.past ? <Muted>{c.past} held</Muted> : null}
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
