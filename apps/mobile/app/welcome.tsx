import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useRef, useState } from "react";
import { Dimensions, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { brand } from "../src/api";
import { useSession } from "../src/session";
import { withAlpha } from "../src/theme";

/** First launch only: three short slides about what the app does, then sign in. */
export const WELCOME_KEY = "welcome.seen.v1";

const SLIDES: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; body: string }[] = [
  { icon: "calendar", title: "Every event in one place", body: "Hackathons, workshops, talks and competitions across all campuses, plus major outside hackathons you can join." },
  { icon: "qr-code", title: "Register, get your ticket, check in", body: "One tap to register. Your QR ticket lives here; scan the code at the venue to mark your attendance." },
  { icon: "ribbon", title: "Certificates and your LinkedIn post", body: "Get certificates the moment they're issued, with a ready-to-post LinkedIn update to show what you built." },
  { icon: "notifications", title: "Never miss a thing", body: "Reminders before events, announcements, results and certificates, straight to your phone." },
];

export default function WelcomeScreen() {
  const { theme, tenant } = useSession();
  const width = Dimensions.get("window").width;
  const [i, setI] = useState(0);
  const list = useRef<FlatList>(null);
  const last = i === SLIDES.length - 1;
  const name = tenant?.name ?? brand.appName;

  const finish = async () => {
    await SecureStore.setItemAsync(WELCOME_KEY, "1").catch(() => {});
    router.replace("/login");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.heroBg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 8 }}>
        <Text style={{ color: theme.colors.heroFg, fontWeight: "800", fontSize: 16, letterSpacing: 1 }}>{name.toUpperCase()}</Text>
        {!last ? <Pressable onPress={finish} hitSlop={10}><Text style={{ color: withAlpha(theme.colors.heroFg, 0.75), fontWeight: "600" }}>Skip</Text></Pressable> : null}
      </View>
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, padding: 32, justifyContent: "center", alignItems: "center", gap: 20 }}>
            <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: withAlpha(theme.colors.accent, 0.18), alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={item.icon} size={64} color={theme.colors.accent} />
            </View>
            <Text style={{ color: theme.colors.heroFg, fontSize: 28, fontWeight: "800", textAlign: "center", letterSpacing: -0.5 }}>{item.title}</Text>
            <Text style={{ color: withAlpha(theme.colors.heroFg, 0.82), fontSize: 16, lineHeight: 24, textAlign: "center" }}>{item.body}</Text>
          </View>
        )}
      />
      <View style={{ padding: 24, gap: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
          {SLIDES.map((_, n) => <View key={n} style={{ height: 8, width: n === i ? 24 : 8, borderRadius: 4, backgroundColor: n === i ? theme.colors.accent : withAlpha(theme.colors.heroFg, 0.3) }} />)}
        </View>
        <Pressable
          onPress={() => { if (last) return void finish(); list.current?.scrollToIndex({ index: i + 1 }); setI(i + 1); }}
          style={({ pressed }) => ({ backgroundColor: theme.colors.secondary, borderRadius: 999, paddingVertical: 16, alignItems: "center", opacity: pressed ? 0.85 : 1 })}
        >
          <Text style={{ color: theme.colors.secondaryFg, fontWeight: "800", fontSize: 17 }}>{last ? "Get started" : "Next"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
