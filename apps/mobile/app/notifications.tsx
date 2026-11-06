import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Api, AppNotification } from "../src/api";
import { useSession } from "../src/session";
import { withAlpha } from "../src/theme";
import { EmptyState, ErrorBanner, IconName, Loading, Muted, Screen, formatDate, useFocusData } from "../src/ui";

function iconFor(template: string): IconName {
  if (template.startsWith("registration")) return "ticket-outline";
  if (template.startsWith("event.reminder")) return "alarm-outline";
  if (template.startsWith("event.cancelled")) return "close-circle-outline";
  if (template.startsWith("event.updated")) return "create-outline";
  if (template.startsWith("certificate")) return "ribbon-outline";
  if (template.startsWith("linkedin")) return "logo-linkedin";
  if (template.startsWith("feedback")) return "chatbox-ellipses-outline";
  if (template.startsWith("task")) return "checkbox-outline";
  if (template.startsWith("announcement")) return "megaphone-outline";
  return "notifications-outline";
}

export default function NotificationsScreen() {
  const { theme } = useSession();
  const [marking, setMarking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, setData, error, loading, refreshing, refresh } = useFocusData(() => Api.notifications());

  const items = (data ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = items.filter((n) => !n.readAt).length;

  async function markAll() {
    setMarking(true);
    setActionError(null);
    try {
      await Api.markNotificationsRead();
      const now = new Date().toISOString();
      setData(items.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setMarking(false);
    }
  }

  async function open(n: AppNotification) {
    if (!n.readAt) {
      setData(items.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      Api.markNotificationsRead([n.id]).catch(() => undefined);
    }
    if (n.eventId) router.push(`/event/${n.eventId}`);
  }

  return (
    <Screen edges={["bottom"]} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: "Notifications",
          headerRight: () =>
            unread > 0 ? (
              <Pressable onPress={markAll} disabled={marking} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                <Text style={{ color: theme.colors.primary, fontWeight: "700", opacity: marking ? 0.5 : 1 }}>Mark all read</Text>
              </Pressable>
            ) : null,
        }}
      />
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="You're all caught up" message="Event reminders, certificates and updates will appear here." />
      ) : (
        items.map((n) => {
          const isUnread = !n.readAt;
          return (
            <Pressable
              key={n.id}
              onPress={() => open(n)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: "row",
                gap: 12,
                padding: 14,
                marginBottom: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isUnread ? withAlpha(theme.colors.primary, 0.35) : theme.colors.border,
                backgroundColor: isUnread ? withAlpha(theme.colors.primary, 0.06) : theme.colors.card,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: withAlpha(theme.colors.primary, 0.12),
                }}
              >
                <Ionicons name={iconFor(n.template)} size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontWeight: isUnread ? "800" : "600", color: theme.colors.fg, fontSize: 15 }}>{n.subject}</Text>
                <Muted numberOfLines={3}>{n.body}</Muted>
                <Muted style={{ fontSize: 12 }}>{formatDate(n.createdAt)}</Muted>
              </View>
              {n.eventId ? <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} style={{ alignSelf: "center" }} /> : null}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
