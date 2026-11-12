import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { listenForTaps, registerForPush } from "../src/push";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../src/session";
import { isDark } from "../src/theme";

/** Once signed in: register this phone for push notifications and open the event when one is tapped. */
function PushSetup() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "signedIn") return;
    registerForPush().catch(() => {});
    return listenForTaps();
  }, [status]);
  return null;
}

function RootStack() {
  const { theme } = useSession();
  return (
    <>
      <StatusBar style={isDark(theme.colors.bg) ? "light" : "dark"} />
      <PushSetup />
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
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="calendar" options={{ title: "Calendar" }} />
        <Stack.Screen name="attend/index" options={{ title: "Mark my attendance" }} />
        <Stack.Screen name="attend/[event]" options={{ title: "Checking you in" }} />
        <Stack.Screen name="events/[slug]" options={{ title: "Event" }} />
        <Stack.Screen name="feedback/[eventId]" options={{ title: "Feedback" }} />
        <Stack.Screen name="assistant" options={{ title: "Ask the assistant" }} />
        <Stack.Screen name="profile-edit" options={{ title: "Edit profile" }} />
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
