import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Api, Standings } from "./api";
import { useTheme } from "./session";
import { withAlpha } from "./theme";
import { Muted, SectionHeader, humanize } from "./ui";

const MEDAL: Record<number, string> = { 1: "#f5b301", 2: "#a8b2c1", 3: "#e08a3c" };

/** Event leaderboard (after results are published): every team by rank, with round tabs and scores if shown. */
export function LeaderboardSection({ eventId }: { eventId: string }) {
  const t = useTheme();
  const [roundId, setRoundId] = useState<string | null>(null);
  const [data, setData] = useState<Standings | null>(null);
  useEffect(() => { Api.standings(eventId, roundId).then(setData).catch(() => setData(null)); }, [eventId, roundId]);
  if (!data?.published || data.hidden || !data.rows.length) return null;
  const tabs = [{ id: null as string | null, name: "Final" }, ...(data.rounds.length > 1 ? data.rounds : [])];
  const top = data.rows.reduce((m, r) => Math.max(m, r.score ?? 0), 0) || 100;
  return (
    <View>
      <SectionHeader>Leaderboard</SectionHeader>
      {tabs.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 10 }} contentContainerStyle={{ gap: 8 }}>
          {tabs.map((tab) => {
            const active = roundId === tab.id;
            return (
              <Pressable key={tab.id ?? "final"} onPress={() => setRoundId(tab.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: active ? t.colors.primary : t.colors.border, backgroundColor: active ? t.colors.primary : t.colors.card }}>
                <Text style={{ fontWeight: "600", color: active ? t.colors.primaryFg : t.colors.fg }}>{tab.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={{ borderRadius: t.radius ?? 12, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.card, overflow: "hidden" }}>
        {data.rows.map((r, i) => (
          <View key={r.teamId} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.colors.border, backgroundColor: r.rank === 1 ? withAlpha("#f5b301", 0.07) : undefined }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: r.rank && MEDAL[r.rank] ? MEDAL[r.rank] : withAlpha(t.colors.muted, 0.12) }}>
              <Text style={{ fontWeight: "800", color: r.rank && MEDAL[r.rank] ? "#1f2937" : t.colors.fg }}>{r.rank ?? "–"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 15, color: t.colors.fg }} numberOfLines={1}>{r.teamName}</Text>
              {r.award ? <Text style={{ fontSize: 12, fontWeight: "700", color: "#b45309" }}>🏆 {humanize(r.award)}</Text> : null}
              {r.projectTitle ? <Muted numberOfLines={1} style={{ fontSize: 13 }}>{r.projectTitle}</Muted> : null}
              {r.members.length ? <Muted numberOfLines={1} style={{ fontSize: 12 }}>{r.members.map((m) => m.name.split(" ")[0]).join(", ")}</Muted> : null}
            </View>
            {r.score != null ? (
              <View style={{ width: 70, alignItems: "flex-end" }}>
                <Text style={{ fontWeight: "800", fontSize: 16, color: t.colors.fg }}>{r.score}</Text>
                <View style={{ width: 64, height: 5, borderRadius: 3, backgroundColor: withAlpha(t.colors.fg, 0.08), marginTop: 4 }}>
                  <View style={{ width: `${Math.max(4, (r.score / top) * 100)}%`, height: 5, borderRadius: 3, backgroundColor: t.colors.accent }} />
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      <Muted style={{ fontSize: 12, marginTop: 6 }}>
        {data.totalTeams && data.totalTeams > data.rows.length ? `${data.rows.length} ranked of ${data.totalTeams} teams.` : `${data.rows.length} teams.`}
        {data.showScores ? " Scores: judges' average out of 100." : ""}
      </Muted>
    </View>
  );
}
