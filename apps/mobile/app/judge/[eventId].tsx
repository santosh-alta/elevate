import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Api, JudgeTeam, JudgeTeamStatus, JudgingRound, RoundState, roundState } from "../../src/api";
import { draftTeamIds } from "../../src/drafts";
import { useSession } from "../../src/session";
import { STATUS_COLORS, withAlpha } from "../../src/theme";
import { Badge, Card, EmptyState, ErrorBanner, Loading, Muted, ProgressBar, Row, Screen, formatDate, useFocusData } from "../../src/ui";

const STATUS_BADGE: Record<JudgeTeamStatus, { label: string; tone: "neutral" | "warning" | "success" }> = {
  PENDING: { label: "Not scored", tone: "neutral" },
  DRAFT: { label: "Draft", tone: "warning" },
  SUBMITTED: { label: "Submitted", tone: "success" },
};

const ROUND_STATE: Record<RoundState, { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  open: { label: "Open", color: STATUS_COLORS.success, icon: "radio-button-on" },
  closed: { label: "Closed", color: "#64748b", icon: "lock-closed" },
  upcoming: { label: "Upcoming", color: STATUS_COLORS.warning, icon: "time-outline" },
};

type Filter = "all" | "todo" | "done";

function RoundChip({ round, active, onPress }: { round: JudgingRound; active: boolean; onPress: () => void }) {
  const { theme } = useSession();
  const state = roundState(round);
  const s = ROUND_STATE[state];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        minWidth: 110,
        backgroundColor: active ? theme.colors.primary : theme.colors.card,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        gap: 2,
      }}
    >
      <Text style={{ color: active ? theme.colors.primaryFg : theme.colors.fg, fontWeight: "700" }} numberOfLines={1}>
        {round.name}
      </Text>
      <Row style={{ gap: 4 }}>
        <Ionicons name={s.icon} size={12} color={active ? theme.colors.primaryFg : s.color} />
        <Text style={{ fontSize: 12, fontWeight: "600", color: active ? theme.colors.primaryFg : s.color }}>
          {state === "upcoming" && round.opensAt ? `Opens ${formatDate(round.opensAt, false)}` : s.label}
        </Text>
      </Row>
    </Pressable>
  );
}

export default function JudgeTeamsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { theme } = useSession();
  const [roundId, setRoundId] = useState<string | undefined>();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, error, loading, refreshing, refresh } = useFocusData(async () => {
    const payload = await Api.judgeEvent(eventId, roundId);
    const local = payload.round ? await draftTeamIds(payload.round.id, payload.teams.map((t) => t.id)) : new Set<string>();
    return { ...payload, local };
  }, [eventId, roundId]);

  if (loading && !data) return <Loading />;
  const teams = data?.teams ?? [];
  const round = data?.round ?? null;
  const state = roundState(round);
  const submitted = teams.filter((t) => t.status === "SUBMITTED").length;
  const visible = teams.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.status === "SUBMITTED" : t.status !== "SUBMITTED",
  );

  const open = (t: JudgeTeam) =>
    round && router.push({ pathname: "/judge/score", params: { eventId, teamId: t.id, roundId: round.id } });

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: data?.event?.title ?? "Teams" }} />
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {data && data.rounds.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
          {data.rounds.map((r) => (
            <RoundChip key={r.id} round={r} active={r.id === round?.id} onPress={() => setRoundId(r.id)} />
          ))}
        </ScrollView>
      ) : null}

      <Card style={{ gap: 8 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "700", color: theme.colors.fg, flex: 1 }} numberOfLines={1}>
            {round?.name ?? "Your progress"}
          </Text>
          <Muted>
            {submitted}/{teams.length} scored
          </Muted>
        </Row>
        <ProgressBar value={teams.length ? submitted / teams.length : 0} />
        {round?.description ? <Muted>{round.description}</Muted> : null}
        {state === "open" && round?.closesAt ? <Muted>Closes {formatDate(round.closesAt)}</Muted> : null}
        {state === "closed" ? <Muted>This round is closed. Your marks are read-only.</Muted> : null}
        {state === "upcoming" ? (
          <Muted>
            This round isn't open yet{round?.opensAt ? ` (opens ${formatDate(round.opensAt)})` : ""}. You can look at the teams, but marking
            starts when the organiser opens it.
          </Muted>
        ) : null}
        {data?.criteria.length ? (
          <Muted style={{ fontSize: 12 }}>
            {data.criteria.length} parameter{data.criteria.length === 1 ? "" : "s"}: {data.criteria.map((c) => c.name).join(", ")}
          </Muted>
        ) : null}
      </Card>

      <Row style={{ marginBottom: 12 }}>
        {(
          [
            ["all", `All (${teams.length})`],
            ["todo", `To do (${teams.length - submitted})`],
            ["done", `Done (${submitted})`],
          ] as [Filter, string][]
        ).map(([key, label]) => {
          const active = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 999,
                alignItems: "center",
                backgroundColor: active ? withAlpha(theme.colors.primary, 0.12) : "transparent",
                borderWidth: 1,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              }}
            >
              <Text style={{ fontWeight: "600", color: active ? theme.colors.primary : theme.colors.muted }}>{label}</Text>
            </Pressable>
          );
        })}
      </Row>

      {!round ? (
        <EmptyState icon="hourglass-outline" title="No judging rounds yet" message="The organiser hasn't set up a judging round. Pull to refresh later." />
      ) : teams.length === 0 ? (
        <EmptyState icon="people-outline" title="No teams in this round" message="Teams shortlisted for this round and assigned to you will appear here." />
      ) : visible.length === 0 ? (
        <EmptyState icon={filter === "done" ? "hourglass-outline" : "checkmark-done"} title={filter === "done" ? "Nothing submitted yet" : "All done!"} message={filter === "done" ? undefined : "You've submitted marks for every team in this round."} />
      ) : (
        visible.map((t) => {
          const badge = STATUS_BADGE[t.status];
          const onPhone = t.status !== "SUBMITTED" && data?.local.has(t.id);
          return (
            <Card key={t.id} onPress={() => open(t)}>
              <Row style={{ gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>{t.name}</Text>
                  {t.projectTitle ? <Muted numberOfLines={1}>{t.projectTitle}</Muted> : <Muted>No submission yet</Muted>}
                  {t.problemStatement ? (
                    <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                      {[t.problemStatement.code, t.problemStatement.title].filter(Boolean).join(" · ")}
                    </Muted>
                  ) : null}
                  <Row style={{ flexWrap: "wrap" }}>
                    <Badge label={badge.label} tone={badge.tone} />
                    {onPhone ? <Badge label="Unsaved marks on phone" tone="warning" /> : null}
                    {t.myReview?.recommend ? <Badge label="Recommended" tone="primary" /> : null}
                  </Row>
                </View>
                <Ionicons name={state === "open" && t.status !== "SUBMITTED" ? "create-outline" : "eye-outline"} size={20} color={theme.colors.muted} />
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
