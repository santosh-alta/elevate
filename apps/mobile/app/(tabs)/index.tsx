import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { Api } from "../../src/api";
import { EventCard } from "../../src/events";
import { useSession } from "../../src/session";
import { EmptyState, ErrorBanner, Loading, Screen, Title, humanize, useFocusData } from "../../src/ui";

const FILTERS = ["ALL", "HACKATHON", "SEMINAR", "WORKSHOP", "GUEST_LECTURE", "WEBINAR", "COMPETITION"] as const;

export default function EventsScreen() {
  const { theme, user, tenant } = useSession();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const { data, error, loading, refreshing, refresh } = useFocusData(() => Api.events("upcoming=1"));

  const events = useMemo(
    () => (data ?? []).filter((e) => filter === "ALL" || e.type === filter),
    [data, filter],
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Title subtitle={tenant?.name ? `${tenant.name} · upcoming events` : "Upcoming events"}>
        Hi {user?.name?.split(" ")[0] ?? "there"} 👋
      </Title>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? theme.colors.primary : theme.colors.card,
                borderWidth: 1,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              }}
            >
              <Text style={{ color: active ? theme.colors.primaryFg : theme.colors.fg, fontWeight: "600" }}>
                {f === "ALL" ? "All" : humanize(f)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading />
      ) : events.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No events yet" message="New hackathons, seminars and workshops will show up here." />
      ) : (
        events.map((e) => <EventCard key={e.id} event={e} onPress={() => router.push(`/event/${e.id}`)} />)
      )}
    </Screen>
  );
}
