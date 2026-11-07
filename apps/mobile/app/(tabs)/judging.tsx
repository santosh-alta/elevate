import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { Api } from "../../src/api";
import { useSession } from "../../src/session";
import { withAlpha } from "../../src/theme";
import { Badge, Card, EmptyState, ErrorBanner, Loading, Muted, Row, Screen, Title, formatDate, humanize, useFocusData } from "../../src/ui";

export default function JudgingScreen() {
  const { theme } = useSession();
  const { data, error, loading, refreshing, refresh } = useFocusData(Api.judgeEvents);
  const events = data ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Title subtitle="Events where you're a judge.">Judging</Title>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading />
      ) : events.length === 0 ? (
        <EmptyState icon="trophy-outline" title="No judging assignments" message="When an organiser adds you as a judge, the event shows up here." />
      ) : (
        events.map((e) => {
          const openRound = e.rounds?.find((r) => r.isOpen);
          return (
            <Card key={e.id} onPress={() => router.push(`/judge/${e.id}`)}>
              <Row style={{ gap: 12 }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: withAlpha(theme.colors.primary, 0.12),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="trophy" size={24} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>{e.title}</Text>
                  <Muted>{formatDate(e.startsAt, false)}</Muted>
                  <Row style={{ flexWrap: "wrap" }}>
                    <Badge label={humanize(e.status)} tone={e.status === "JUDGING" ? "success" : "neutral"} />
                    {openRound ? <Badge label={`${openRound.name} open`} tone="success" /> : <Badge label="No round open" />}
                  </Row>
                  {typeof e.assignedTeams === "number" ? (
                    <Muted style={{ fontSize: 12 }}>
                      {e.submittedTeams ?? 0}/{e.assignedTeams} teams marked{openRound ? ` in ${openRound.name}` : ""}
                    </Muted>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} />
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
