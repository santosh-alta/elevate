import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Api, JudgeTeam, RubricCriterion } from "../../src/api";
import { useSession } from "../../src/session";
import { STATUS_COLORS, withAlpha } from "../../src/theme";
import { Badge, Body, Button, Card, ErrorBanner, Input, Loading, Muted, Row, Screen, SectionHeader } from "../../src/ui";

function Stepper({
  criterion,
  value,
  locked,
  onChange,
}: {
  criterion: RubricCriterion;
  value: number | undefined;
  locked: boolean;
  onChange: (v: number) => void;
}) {
  const { theme } = useSession();
  const max = criterion.maxScore;
  const current = value ?? 0;
  const quickPicks = Array.from({ length: max + 1 }, (_, i) => i);

  const stepButton = (icon: "remove" | "add", next: number) => (
    <Pressable
      disabled={locked || next < 0 || next > max}
      onPress={() => onChange(next)}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: withAlpha(theme.colors.primary, pressed ? 0.25 : 0.12),
        opacity: locked || next < 0 || next > max ? 0.4 : 1,
      })}
    >
      <Ionicons name={icon} size={24} color={theme.colors.primary} />
    </Pressable>
  );

  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>{criterion.name}</Text>
          {criterion.description ? <Muted style={{ marginTop: 2 }}>{criterion.description}</Muted> : null}
        </View>
        {criterion.weight !== 1 ? <Badge label={`×${criterion.weight}`} tone="primary" /> : null}
      </Row>

      <Row style={{ justifyContent: "space-between" }}>
        {stepButton("remove", current - 1)}
        <Text style={{ fontSize: 36, fontWeight: "800", color: value === undefined ? theme.colors.muted : theme.colors.fg }}>
          {value === undefined ? "–" : value}
          <Text style={{ fontSize: 18, color: theme.colors.muted, fontWeight: "600" }}> / {max}</Text>
        </Text>
        {stepButton("add", value === undefined ? 0 : current + 1)}
      </Row>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {quickPicks.map((n) => {
          const active = n === value;
          return (
            <Pressable
              key={n}
              disabled={locked}
              onPress={() => onChange(n)}
              style={{
                minWidth: 38,
                height: 38,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active ? theme.colors.primary : theme.colors.bg,
                borderWidth: 1,
                borderColor: active ? theme.colors.primary : theme.colors.border,
                opacity: locked && !active ? 0.5 : 1,
              }}
            >
              <Text style={{ fontWeight: "700", color: active ? theme.colors.primaryFg : theme.colors.fg }}>{n}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Card>
  );
}

function LinkButton({ label, url, icon }: { label: string; url?: string | null; icon: React.ComponentProps<typeof Ionicons>["name"] }) {
  if (!url) return null;
  return <Button title={label} icon={icon} variant="secondary" size="sm" onPress={() => WebBrowser.openBrowserAsync(url)} />;
}

export default function ScoreTeamScreen() {
  const { eventId, teamId, roundId } = useLocalSearchParams<{ eventId: string; teamId: string; roundId: string }>();
  const { theme } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rubric, setRubric] = useState<RubricCriterion[]>([]);
  const [team, setTeam] = useState<JudgeTeam | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [criteria, res] = await Promise.all([Api.rubric(eventId), Api.judgeTeams(eventId, roundId)]);
        const t = res.teams.find((x) => x.id === teamId) ?? null;
        setRubric(criteria);
        setTeam(t);
        if (t) {
          setValues(Object.fromEntries(t.myScores.map((s) => [s.criterionId, s.value])));
          setComment(t.myScores.find((s) => s.comment)?.comment ?? "");
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId, teamId, roundId]);

  const locked = team?.status === "SUBMITTED";
  const scoredCount = rubric.filter((c) => values[c.id] !== undefined).length;
  const complete = rubric.length > 0 && scoredCount === rubric.length;

  const total = useMemo(() => {
    let got = 0;
    let max = 0;
    for (const c of rubric) {
      got += (values[c.id] ?? 0) * c.weight;
      max += c.maxScore * c.weight;
    }
    return { got: Math.round(got * 10) / 10, max: Math.round(max * 10) / 10 };
  }, [rubric, values]);

  async function save(submit: boolean) {
    setSaving(submit ? "submit" : "draft");
    setError(null);
    try {
      await Api.saveScores({
        roundId,
        teamId,
        submit,
        scores: rubric
          .filter((c) => values[c.id] !== undefined)
          .map((c) => ({ criterionId: c.id, value: values[c.id], ...(comment.trim() ? { comment: comment.trim() } : {}) })),
      });
      if (submit) {
        setTeam((t) => (t ? { ...t, status: "SUBMITTED" } : t));
        Alert.alert("Scores submitted", `${team?.name ?? "Team"}: ${total.got} / ${total.max}`, [
          { text: "Back to teams", onPress: () => router.back() },
        ]);
      } else {
        setTeam((t) => (t ? { ...t, status: "DRAFT" } : t));
        Alert.alert("Draft saved", "You can come back and change it before submitting.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  function confirmSubmit() {
    Alert.alert(
      "Submit scores?",
      `${team?.name}: ${total.got} / ${total.max}\n\nScores are locked after you submit and can't be changed.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Submit", style: "default", onPress: () => save(true) },
      ],
    );
  }

  if (loading) return <Loading />;
  if (!team)
    return (
      <Screen edges={[]}>
        <ErrorBanner message={error ?? "Team not found in your assignments."} />
      </Screen>
    );

  const members = (team.members ?? []).map((m) => m.user?.name ?? m.name).filter(Boolean).join(", ");

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: team.name }} />
      {error ? <ErrorBanner message={error} /> : null}

      {locked ? (
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            padding: 12,
            borderRadius: 10,
            backgroundColor: STATUS_COLORS.successBg,
            marginBottom: 12,
          }}
        >
          <Ionicons name="lock-closed" size={18} color={STATUS_COLORS.success} />
          <Text style={{ color: STATUS_COLORS.success, fontWeight: "600", flex: 1 }}>Submitted and locked.</Text>
        </View>
      ) : null}

      <Card style={{ gap: 8 }}>
        <Text style={{ fontWeight: "800", fontSize: 20, color: theme.colors.fg }}>{team.projectTitle ?? team.name}</Text>
        {members ? <Muted>{members}</Muted> : null}
        {team.projectSummary ? <Body>{team.projectSummary}</Body> : <Muted>No project summary submitted.</Muted>}
        <Row style={{ flexWrap: "wrap", marginTop: 4 }}>
          <LinkButton label="Repo" url={team.repoUrl} icon="logo-github" />
          <LinkButton label="Demo" url={team.demoUrl} icon="globe-outline" />
          <LinkButton label="Deck" url={team.deckUrl} icon="easel-outline" />
          <LinkButton label="Video" url={team.videoUrl} icon="play-circle-outline" />
        </Row>
      </Card>

      <SectionHeader right={<Muted>{scoredCount}/{rubric.length} scored</Muted>}>Rubric</SectionHeader>
      {rubric.length === 0 ? <Muted>The organiser hasn't set up a rubric yet.</Muted> : null}
      {rubric.map((c) => (
        <Stepper
          key={c.id}
          criterion={c}
          value={values[c.id]}
          locked={locked}
          onChange={(v) => setValues((prev) => ({ ...prev, [c.id]: v }))}
        />
      ))}

      <Input label="Comments for the team (optional)" value={comment} onChangeText={setComment} multiline editable={!locked} placeholder="Strengths, what to improve…" />

      <Card style={{ alignItems: "center" }}>
        <Muted>Weighted total</Muted>
        <Text style={{ fontSize: 32, fontWeight: "800", color: theme.colors.primary }}>
          {total.got} <Text style={{ fontSize: 18, color: theme.colors.muted }}>/ {total.max}</Text>
        </Text>
      </Card>

      {!locked ? (
        <View style={{ gap: 10 }}>
          <Button title="Save draft" icon="save-outline" variant="secondary" onPress={() => save(false)} loading={saving === "draft"} disabled={scoredCount === 0 || !!saving} />
          <Button title={complete ? "Submit scores" : `Score all criteria to submit (${scoredCount}/${rubric.length})`} icon="checkmark-done" size="lg" onPress={confirmSubmit} loading={saving === "submit"} disabled={!complete || !!saving} />
        </View>
      ) : null}
    </Screen>
  );
}
