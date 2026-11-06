import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../src/session";

function RootStack() {
  const { theme } = useSession();
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: theme.colors.primary,
          headerStyle: { backgroundColor: theme.colors.card },
          headerTitleStyle: { color: theme.colors.fg, fontWeight: "700" },
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
