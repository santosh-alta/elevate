import { router } from "expo-router";
import React from "react";
import { Api } from "../../src/api";
import { EventCard } from "../../src/events";
import { EmptyState, ErrorBanner, Loading, Muted, Screen, useFocusData } from "../../src/ui";

export default function OpsEventsScreen() {
  // Staff see every status (planning through completed), not just upcoming.
  const { data, error, loading, refreshing, refresh } = useFocusData(() => Api.events(""));
  const events = (data ?? [])
    .filter((e) => !["ARCHIVED", "CANCELLED"].includes(e.status))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={refresh}>
      <Muted style={{ marginBottom: 12 }}>Pick an event to update its checklist or add photos and media.</Muted>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading />
      ) : events.length === 0 ? (
        <EmptyState icon="construct-outline" title="No events" />
      ) : (
        events.map((e) => <EventCard key={e.id} event={e} onPress={() => router.push(`/ops/${e.id}`)} />)
      )}
    </Screen>
  );
}
