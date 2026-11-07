import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../src/session";
import { isDark } from "../src/theme";

function RootStack() {
  const { theme } = useSession();
  return (
    <>
      <StatusBar style={isDark(theme.colors.bg) ? "light" : "dark"} />
      <Stack
        screenOptions={{
          // Brand hero colour for headers (Alta navy with white text).
          headerTintColor: theme.colors.heroFg,
          headerStyle: { backgroundColor: theme.colors.heroBg },
          headerTitleStyle: { color: theme.colors.heroFg, fontWeight: "700" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.bg },
          headerBackTitle: "Back",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="event/[id]" options={{ title: "Event" }} />
        <Stack.Screen name="judge/[eventId]" options={{ title: "Teams" }} />
        <Stack.Screen name="judge/score" options={{ title: "Score team" }} />
        <Stack.Screen name="ops/index" options={{ title: "Event ops" }} />
        <Stack.Screen name="ops/[eventId]" options={{ title: "Event ops" }} />
        <Stack.Screen name="team/[eventId]" options={{ title: "My team" }} />
        <Stack.Screen name="gallery/[eventId]" options={{ title: "Photos" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RootStack />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
