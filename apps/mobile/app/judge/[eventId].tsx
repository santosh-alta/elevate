import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Api, JudgeTeamStatus, JudgingRound } from "../../src/api";
import { useSession } from "../../src/session";
import { Badge, Card, EmptyState, ErrorBanner, Loading, Muted, ProgressBar, Row, Screen, useFocusData } from "../../src/ui";

const STATUS_BADGE: Record<JudgeTeamStatus, { label: string; tone: "neutral" | "warning" | "success" }> = {
  PENDING: { label: "Not scored", tone: "neutral" },
  DRAFT: { label: "Draft", tone: "warning" },
  SUBMITTED: { label: "Submitted", tone: "success" },
};

export default function JudgeTeamsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { theme } = useSession();
  const [roundId, setRoundId] = useState<string | undefined>();

  const { data, error, loading, refreshing, refresh } = useFocusData(async () => {
    const [events, teamsRes] = await Promise.all([
      Api.judgeEvents().catch(() => []),
      Api.judgeTeams(eventId, roundId),
    ]);
    const event = events.find((e) => e.id === eventId);
    const rounds: JudgingRound[] = teamsRes.rounds ?? event?.rounds ?? [];
    const activeRound = teamsRes.round ?? rounds.find((r) => r.id === roundId) ?? rounds.find((r) => r.isOpen) ?? rounds[0];
    return { event, rounds, activeRound, teams: teamsRes.teams };
  }, [eventId, roundId]);

  if (loading) return <Loading />;
  const teams = data?.teams ?? [];
  const submitted = teams.filter((t) => t.status === "SUBMITTED").length;
  const activeRound = data?.activeRound;

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: data?.event?.title ?? "Teams" }} />
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {data && data.rounds.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
          {data.rounds.map((r) => {
            const active = r.id === activeRound?.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setRoundId(r.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? theme.colors.primary : theme.colors.card,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text style={{ color: active ? theme.colors.primaryFg : theme.colors.fg, fontWeight: "600" }}>
                  {r.name}
                  {r.isOpen ? " •" : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Card style={{ gap: 8 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "700", color: theme.colors.fg }}>{activeRound?.name ?? "Your progress"}</Text>
          <Muted>
            {submitted}/{teams.length} submitted
          </Muted>
        </Row>
        <ProgressBar value={teams.length ? submitted / teams.length : 0} />
        {activeRound && activeRound.isOpen === false ? <Muted>This round is closed. Scores are read-only.</Muted> : null}
      </Card>

      {teams.length === 0 ? (
        <EmptyState icon="people-outline" title="No teams assigned" message="Teams assigned to you for this round will appear here." />
      ) : (
        teams.map((t) => {
          const badge = STATUS_BADGE[t.status];
          return (
            <Card
              key={t.id}
              onPress={() =>
                activeRound
                  ? router.push({ pathname: "/judge/score", params: { eventId, teamId: t.id, roundId: activeRound.id } })
                  : undefined
              }
            >
              <Row style={{ gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>{t.name}</Text>
                  {t.projectTitle ? <Muted numberOfLines={1}>{t.projectTitle}</Muted> : <Muted>No submission yet</Muted>}
                  <Badge label={badge.label} tone={badge.tone} />
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} />
              </Row>
            </Card>
          );
        })
      )}
      {!activeRound && teams.length > 0 ? <Muted>No judging round is set up yet. Ask the organiser to open one.</Muted> : null}
    </Screen>
  );
}
