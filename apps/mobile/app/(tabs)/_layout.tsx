import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import React from "react";
import { useSession } from "../../src/session";
import type { IconName } from "../../src/ui";

function icon(name: IconName) {
  return ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} size={size} color={color as string} />;
}

export default function TabsLayout() {
  const { status, theme, isJudge, canCheckin } = useSession();
  if (status === "signedOut") return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Events", tabBarIcon: icon("calendar") }} />
      <Tabs.Screen name="tickets" options={{ title: "Tickets", tabBarIcon: icon("qr-code") }} />
      <Tabs.Screen
        name="judging"
        options={{ title: "Judging", tabBarIcon: icon("trophy"), href: isJudge ? undefined : null }}
      />
      <Tabs.Screen
        name="checkin"
        options={{ title: "Check-in", tabBarIcon: icon("scan"), href: canCheckin ? undefined : null }}
      />
      <Tabs.Screen name="certificates" options={{ title: "Certificates", tabBarIcon: icon("ribbon") }} />
      <Tabs.Screen name="linkedin" options={{ title: "Posts", tabBarIcon: icon("logo-linkedin") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person-circle") }} />
    </Tabs>
  );
}
