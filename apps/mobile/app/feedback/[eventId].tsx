import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Api, FeedbackInput } from "../../src/api";
import { useSession } from "../../src/session";
import { STATUS_COLORS } from "../../src/theme";
import { Button, Card, EmptyState, ErrorBanner, Input, Loading, Muted, Screen, SectionHeader, useFocusData } from "../../src/ui";

/** Feedback after an event: overall stars, how likely to recommend, ratings by area, what worked and what to improve. */
const ASPECTS: { key: keyof NonNullable<FeedbackInput["aspects"]>; label: string }[] = [
  { key: "content", label: "Content" }, { key: "speakers", label: "Speakers / mentors" },
  { key: "organisation", label: "Organisation" }, { key: "venue", label: "Venue / online setup" },
];

function Stars({ value, onChange, size = 34 }: { value: number; onChange: (n: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}>
          <Ionicons name={value >= n ? "star" : "star-outline"} size={size} color={value >= n ? "#f59e0b" : "#cbd5e1"} />
        </Pressable>
      ))}
    </View>
  );
}

export default function FeedbackScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { theme } = useSession();
  const { data, error, loading, refresh } = useFocusData(() => Api.myFeedback(eventId), [eventId]);
  const [rating, setRating] = useState(0);
  const [nps, setNps] = useState<number | null>(null);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [liked, setLiked] = useState("");
  const [improve, setImprove] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (loading) return <Loading />;
  if (error || !data) return <Screen edges={[]}><ErrorBanner message={error ?? "Couldn't load"} onRetry={refresh} /></Screen>;
  if (done || data.submitted) return (
    <Screen edges={[]}>
      <EmptyState icon="heart" title="Thanks for your feedback!" message="It helps the team make the next event better." action={<Button title="Back" onPress={() => router.back()} />} />
    </Screen>
  );
  if (!data.registered) return <Screen edges={[]}><EmptyState icon="lock-closed-outline" title="Only participants can give feedback" /></Screen>;
  if (!data.open) return <Screen edges={[]}><EmptyState icon="time-outline" title="Feedback opens once the event starts" /></Screen>;

  const submit = async () => {
    if (!rating) { setMsg("Please give an overall rating."); return; }
    setBusy(true); setMsg(null);
    try {
      await Api.sendFeedback(eventId, {
        rating, ...(nps != null && { nps }), aspects,
        ...(liked.trim() && { liked: liked.trim() }), ...(improve.trim() && { improve: improve.trim() }),
      });
      setDone(true);
    } catch (e: any) {
      setMsg(e?.message ?? "Couldn't send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: theme.colors.fg }}>{data.event.title}</Text>
      <Muted style={{ marginBottom: 8 }}>Takes about a minute. The organisers read every answer.</Muted>

      <SectionHeader>Overall</SectionHeader>
      <Card style={{ alignItems: "center", gap: 6 }}><Stars value={rating} onChange={setRating} size={40} /></Card>

      <SectionHeader>How likely are you to recommend it to a friend?</SectionHeader>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {Array.from({ length: 11 }, (_, n) => (
          <Pressable key={n} onPress={() => setNps(n)} style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: nps === n ? theme.colors.primary : theme.colors.border, backgroundColor: nps === n ? theme.colors.primary : theme.colors.card }}>
            <Text style={{ fontWeight: "700", color: nps === n ? theme.colors.primaryFg : theme.colors.fg }}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <Muted style={{ fontSize: 12, marginTop: 4 }}>0 = not at all · 10 = definitely</Muted>

      <SectionHeader>Rate each part</SectionHeader>
      <Card style={{ gap: 14 }}>
        {ASPECTS.map((a) => (
          <View key={a.key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: theme.colors.fg, flex: 1 }}>{a.label}</Text>
            <Stars value={aspects[a.key] ?? 0} onChange={(n) => setAspects((x) => ({ ...x, [a.key]: n }))} size={24} />
          </View>
        ))}
      </Card>

      <Input label="What did you like most?" value={liked} onChangeText={setLiked} multiline maxLength={2000} />
      <Input label="What should we improve?" value={improve} onChangeText={setImprove} multiline maxLength={2000} />
      {msg ? <Text style={{ color: STATUS_COLORS.danger, marginBottom: 8 }}>{msg}</Text> : null}
      <Button title="Send feedback" icon="send" size="lg" onPress={submit} loading={busy} />
    </Screen>
  );
}
