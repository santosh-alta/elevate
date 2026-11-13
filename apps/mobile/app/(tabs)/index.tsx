import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Api, EVENT_FAMILIES, type EventFamily } from "../../src/api";
import { Avatar } from "../../src/avatar";
import { EventCard } from "../../src/events";
import { useSession } from "../../src/session";
import { STATUS_COLORS, withAlpha } from "../../src/theme";
import { EmptyState, ErrorBanner, Loading, Screen, Title, useFocusData } from "../../src/ui";

const FAMILY_FILTERS: { key: EventFamily | null; label: string }[] = [{ key: null, label: "All" }, ...EVENT_FAMILIES];

/** Bell with unread count; refreshes whenever the Events tab gains focus. */
function NotificationBell() {
  const { theme } = useSession();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Api.notifications(true)
        .then((items) => alive && setUnread(items.filter((n) => !n.readAt).length))
        .catch(() => alive && setUnread(0));
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name="notifications-outline" size={22} color={theme.colors.fg} />
      {unread > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: STATUS_COLORS.danger,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function EventsScreen() {
  const { theme, user, tenant, membership } = useSession();
  const [family, setFamily] = useState<EventFamily | null>(null);
  const [campusId, setCampusId] = useState<string | null>(null);
  // Filters run on the server (GET /events?family=&campusId=); reloads whenever they change.
  const { data, error, loading, refreshing, refresh } = useFocusData(() => Api.eventsByFamily(family, campusId), [family, campusId]);
  // Campus chips: the person's own campus first.
  const campuses = [...(tenant?.campuses ?? [])].sort((a, b) => Number(b.id === membership?.campusId) - Number(a.id === membership?.campusId));
  const campusName = tenant?.campuses.find((c) => c.id === campusId)?.city;
  const events = data ?? [];
  const familyLabel = EVENT_FAMILIES.find((f) => f.key === family)?.label;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Title subtitle={tenant?.name ? `${tenant.name} · upcoming events` : "Upcoming events"}>
            Hi {user?.name?.split(" ")[0] ?? "there"}
          </Title>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <NotificationBell />
          <Pressable onPress={() => router.push("/(tabs)/profile")} accessibilityRole="button" accessibilityLabel="Profile" hitSlop={6}>
            <Avatar name={user?.name} url={user?.avatarUrl} size={44} />
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
        {([
          ["calendar", "Calendar", "/calendar"],
          ["scan", "Check in", "/attend"],
          ["business", "Campuses", "/campuses"],
          ["sparkles", "Ask", "/assistant"],
        ] as const).map(([icon, label, href]) => (
          <Pressable
            key={href}
            onPress={() => router.push(href)}
            accessibilityRole="button"
            style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 2, borderRadius: theme.radius ?? 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, opacity: pressed ? 0.8 : 1 })}
          >
            <Ionicons name={icon} size={22} color={theme.colors.accent} />
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: theme.colors.fg }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
        {FAMILY_FILTERS.map((f) => {
          const active = f.key === family;
          return (
            <Pressable
              key={f.key ?? "ALL"}
              onPress={() => setFamily(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? theme.colors.primary : theme.colors.card,
                borderWidth: 1,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              }}
            >
              <Text style={{ color: active ? theme.colors.primaryFg : theme.colors.fg, fontWeight: "600" }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {campuses.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: -6, marginBottom: 16, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null as string | null, label: "All campuses" }, ...campuses.map((c) => ({ id: c.id as string | null, label: c.city ?? c.code }))].map((c) => {
            const active = c.id === campusId;
            return (
              <Pressable
                key={c.id ?? "ALL"}
                onPress={() => setCampusId(c.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: active ? withAlpha(theme.colors.accent, 0.16) : "transparent", borderWidth: 1, borderColor: active ? theme.colors.accent : theme.colors.border }}
              >
                <Ionicons name={c.id ? "location-outline" : "globe-outline"} size={13} color={active ? theme.colors.fg : theme.colors.muted} />
                <Text style={{ fontSize: 13, color: theme.colors.fg, fontWeight: active ? "700" : "500" }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading />
      ) : events.length === 0 ? (
        familyLabel ? (
          <EmptyState icon="calendar-outline" title={`No upcoming ${familyLabel.toLowerCase()}${campusName ? ` in ${campusName}` : ""}`} message="Try another category or campus, or check back soon." />
        ) : campusName ? (
          <EmptyState icon="calendar-outline" title={`Nothing coming up in ${campusName} yet`} message="Try All campuses, or check back soon." />
        ) : (
          <EmptyState icon="calendar-outline" title="No events yet" message="New hackathons, seminars, talks and workshops will show up here." />
        )
      ) : (
        events.map((e) => <EventCard key={e.id} event={e} onPress={() => router.push(`/event/${e.id}`)} />)
      )}
    </Screen>
  );
}
