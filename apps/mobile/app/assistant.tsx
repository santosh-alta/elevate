import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api, ChatInfo } from "../src/api";
import { useSession } from "../src/session";
import { withAlpha } from "../src/theme";
import { Muted } from "../src/ui";

/** The events assistant (same as the chat bubble on the website): answers from the platform's own data. */
type Msg = { role: "user" | "assistant"; text: string };

export default function AssistantScreen() {
  const { theme, user } = useSession();
  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);

  useEffect(() => { Api.chatInfo().then(setInfo).catch(() => setInfo(null)); }, []);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [msgs, busy]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...msgs, { role: "user" as const, text: question }].slice(-20);
    setMsgs(next); setText(""); setBusy(true);
    try {
      const r = await Api.chat(next);
      setMsgs((m) => [...m, { role: "assistant", text: r.reply }]);
      if (r.usage && info) setInfo({ ...info, usage: r.usage });
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", text: e?.message ?? "Sorry, something went wrong. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  const out = info?.usage ? info.usage.remaining <= 0 : false;
  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={scroll as never} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {!msgs.length ? (
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 20 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: withAlpha(theme.colors.accent, 0.15), alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="sparkles" size={30} color={theme.colors.accent} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: "800", color: theme.colors.fg }}>Hi {user?.name?.split(" ")[0] ?? "there"}, ask me anything</Text>
              <Muted style={{ textAlign: "center" }}>About events, your registrations, certificates and more.</Muted>
              {info && !info.enabled ? <Muted style={{ textAlign: "center" }}>The assistant isn't available right now.</Muted> : null}
              <View style={{ gap: 8, alignSelf: "stretch", marginTop: 8 }}>
                {(info?.suggestions ?? []).slice(0, 5).map((s) => (
                  <Pressable key={s} onPress={() => send(s)} style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card }}>
                    <Text style={{ color: theme.colors.fg }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : msgs.map((m, i) => (
            <View key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", padding: 12, borderRadius: 16, backgroundColor: m.role === "user" ? theme.colors.primary : theme.colors.card, borderWidth: m.role === "user" ? 0 : 1, borderColor: theme.colors.border }}>
              <Text selectable style={{ color: m.role === "user" ? theme.colors.primaryFg : theme.colors.fg, lineHeight: 21 }}>{m.text}</Text>
            </View>
          ))}
          {busy ? <Muted>Thinking…</Muted> : null}
        </ScrollView>
        {info?.usage ? <Muted style={{ textAlign: "center", fontSize: 12 }}>{out ? "You've used today's questions. Try again tomorrow." : `${info.usage.remaining} questions left today`}</Muted> : null}
        <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.card }}>
          <TextInput
            value={text} onChangeText={setText} placeholder="Ask a question…" placeholderTextColor={theme.colors.muted}
            editable={!out && info?.enabled !== false} onSubmitEditing={() => send(text)} returnKeyType="send" maxLength={4000}
            style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: theme.colors.fg, backgroundColor: theme.colors.bg }}
          />
          <Pressable onPress={() => send(text)} disabled={busy || !text.trim() || out} accessibilityLabel="Send" style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary, opacity: busy || !text.trim() ? 0.5 : 1 }}>
            <Ionicons name="arrow-up" size={22} color={theme.colors.primaryFg} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
