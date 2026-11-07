import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api, JudgeComment, JudgePayload, JudgeTeam, RubricCriterion, roundState } from "../../src/api";
import { ScoreDraft, clearDraft, loadDraft, saveDraft } from "../../src/drafts";
import { HtmlContent } from "../../src/html";
import { useSession } from "../../src/session";
import { STATUS_COLORS, withAlpha } from "../../src/theme";
import { Badge, Body, Button, Card, ErrorBanner, IconName, Input, Loading, Muted, Row, SectionHeader } from "../../src/ui";

const STEP = 0.5;

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v / STEP) * STEP));

function openLink(url: string) {
  if (/^https?:\/\//.test(url)) WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
  else Linking.openURL(url).catch(() => Alert.alert("Can't open link", url));
}

// ───────── Team info ─────────

function LinkChip({ label, url, icon }: { label: string; url?: string | null; icon: IconName }) {
  if (!url) return null;
  return <Button title={label} icon={icon} variant="secondary" size="sm" onPress={() => openLink(url)} />;
}

function TeamInfo({ team }: { team: JudgeTeam }) {
  const { theme } = useSession();
  const [showProblem, setShowProblem] = useState(false);
  const hasLinks = team.repoUrl || team.demoUrl || team.deckUrl || team.videoUrl || team.attachments.length > 0;
  return (
    <Card style={{ gap: 10 }}>
      <View>
        <Text style={{ fontWeight: "800", fontSize: 20, color: theme.colors.fg }}>{team.projectTitle || team.name}</Text>
        {team.projectTitle ? <Muted>Team {team.name}</Muted> : null}
      </View>

      {team.members.length ? (
        <View style={{ gap: 4 }}>
          {team.members.map((m, i) => (
            <Row key={`${m.userId ?? i}`} style={{ gap: 6 }}>
              <Ionicons name={m.isLeader ? "star" : "person-outline"} size={14} color={m.isLeader ? STATUS_COLORS.warning : theme.colors.muted} />
              <Text style={{ color: theme.colors.fg }}>{m.name}</Text>
              {m.isLeader ? <Muted style={{ fontSize: 12 }}>Leader</Muted> : null}
            </Row>
          ))}
        </View>
      ) : null}

      {team.problemStatement ? (
        <Pressable
          onPress={() => team.problemStatement?.html && setShowProblem((v) => !v)}
          style={{ padding: 10, borderRadius: 10, backgroundColor: withAlpha(theme.colors.primary, 0.08), gap: 6 }}
        >
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={{ flex: 1, fontWeight: "700", color: theme.colors.fg }}>
              {[team.problemStatement.code, team.problemStatement.title].filter(Boolean).join(" · ")}
            </Text>
            {team.problemStatement.html ? (
              <Ionicons name={showProblem ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.muted} />
            ) : null}
          </Row>
          {showProblem ? <HtmlContent html={team.problemStatement.html} compact /> : null}
        </Pressable>
      ) : null}

      {team.projectSummary ? <Body>{team.projectSummary}</Body> : <Muted>No project summary submitted.</Muted>}

      {team.techStack.length ? (
        <Row style={{ flexWrap: "wrap", gap: 6 }}>
          {team.techStack.map((s) => (
            <Badge key={s} label={s} />
          ))}
        </Row>
      ) : null}

      {hasLinks ? (
        <Row style={{ flexWrap: "wrap" }}>
          <LinkChip label="GitHub" url={team.repoUrl} icon="logo-github" />
          <LinkChip label="Demo" url={team.demoUrl} icon="globe-outline" />
          <LinkChip label="Deck" url={team.deckUrl} icon="easel-outline" />
          <LinkChip label="Video" url={team.videoUrl} icon="play-circle-outline" />
          {team.attachments.map((a, i) => (
            <LinkChip key={`${a.url}-${i}`} label={a.label} url={a.url} icon={a.kind === "file" ? "document-attach-outline" : "link-outline"} />
          ))}
        </Row>
      ) : (
        <Muted>No links submitted.</Muted>
      )}
      {!team.submittedAt ? <Muted style={{ fontSize: 12 }}>The team hasn't locked its submission yet.</Muted> : null}
    </Card>
  );
}

// ───────── Criterion ─────────

function CriterionCard({
  criterion,
  value,
  note,
  locked,
  onChange,
  onNote,
}: {
  criterion: RubricCriterion;
  value: number | undefined;
  note: string;
  locked: boolean;
  onChange: (v: number) => void;
  onNote: (s: string) => void;
}) {
  const { theme } = useSession();
  const max = criterion.maxScore;
  const [noteOpen, setNoteOpen] = useState(!!note);
  const quickStep = max <= 20 ? 1 : Math.ceil(max / 10);
  const quickPicks: number[] = [];
  for (let n = 0; n <= max; n += quickStep) quickPicks.push(n);
  if (quickPicks[quickPicks.length - 1] !== max) quickPicks.push(max);

  const stepButton = (icon: "remove" | "add", next: number) => {
    const disabled = locked || next < 0 || next > max;
    return (
      <Pressable
        disabled={disabled}
        onPress={() => onChange(clamp(next, max))}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${icon === "add" ? "Increase" : "Decrease"} ${criterion.name} by ${STEP}`}
        style={({ pressed }) => ({
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: withAlpha(theme.colors.primary, pressed ? 0.25 : 0.12),
          opacity: disabled ? 0.4 : 1,
        })}
      >
        <Ionicons name={icon} size={26} color={theme.colors.primary} />
      </Pressable>
    );
  };

  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>{criterion.name}</Text>
          {criterion.description ? <Muted style={{ marginTop: 2 }}>{criterion.description}</Muted> : null}
        </View>
        {criterion.weight !== 1 ? <Badge label={`Weight ×${fmt(criterion.weight)}`} tone="primary" /> : null}
      </Row>

      <Row style={{ justifyContent: "space-between" }}>
        {stepButton("remove", (value ?? 0) - STEP)}
        <Text
          accessibilityLabel={`${criterion.name}: ${value === undefined ? "not scored" : fmt(value)} out of ${max}`}
          style={{ fontSize: 36, fontWeight: "800", color: value === undefined ? theme.colors.muted : theme.colors.fg }}
        >
          {value === undefined ? "–" : fmt(value)}
          <Text style={{ fontSize: 18, color: theme.colors.muted, fontWeight: "600" }}> / {max}</Text>
        </Text>
        {stepButton("add", value === undefined ? 0 : value + STEP)}
      </Row>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {quickPicks.map((n) => {
          const active = value !== undefined && Math.floor(value) === n;
          return (
            <Pressable
              key={n}
              disabled={locked}
              onPress={() => onChange(n)}
              style={{
                minWidth: 40,
                height: 40,
                paddingHorizontal: 6,
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

      {noteOpen || note ? (
        <TextInput
          value={note}
          onChangeText={onNote}
          editable={!locked}
          multiline
          placeholder={`Note on ${criterion.name.toLowerCase()} (optional)`}
          placeholderTextColor={theme.colors.muted}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 10,
            padding: 10,
            minHeight: 60,
            color: theme.colors.fg,
            backgroundColor: theme.colors.bg,
            textAlignVertical: "top",
          }}
        />
      ) : !locked ? (
        <Pressable onPress={() => setNoteOpen(true)} hitSlop={6}>
          <Row style={{ gap: 4 }}>
            <Ionicons name="chatbox-ellipses-outline" size={16} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>Add a note</Text>
          </Row>
        </Pressable>
      ) : null}
    </Card>
  );
}

// ───────── Remarks ─────────

function CommentChips({
  comments,
  selected,
  locked,
  onToggle,
}: {
  comments: JudgeComment[];
  selected: string[];
  locked: boolean;
  onToggle: (text: string) => void;
}) {
  const { theme } = useSession();
  const groups = useMemo(() => {
    const categorised = comments.some((c) => c.category);
    if (!categorised) return [{ title: null as string | null, items: comments }];
    const order: string[] = [];
    const map = new Map<string, JudgeComment[]>();
    for (const c of comments) {
      const key = c.category || "More";
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(c);
    }
    const rank = (k: string) => (k === "Positive" ? 0 : k === "Improve" ? 1 : 2);
    return order.sort((a, b) => rank(a) - rank(b)).map((k) => ({ title: k, items: map.get(k)! }));
  }, [comments]);

  // Ticked tags that aren't in the suggestions (e.g. removed later) still show so they can be unticked.
  const extra = selected.filter((s) => !comments.some((c) => c.text === s));

  const chip = (text: string, tone: "positive" | "improve" | "neutral") => {
    const active = selected.includes(text);
    const color = tone === "positive" ? STATUS_COLORS.success : tone === "improve" ? STATUS_COLORS.warning : theme.colors.primary;
    return (
      <Pressable
        key={text}
        disabled={locked}
        onPress={() => onToggle(text)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active, disabled: locked }}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? color : theme.colors.border,
          backgroundColor: active ? withAlpha(color, 0.14) : theme.colors.card,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          opacity: locked && !active ? 0.5 : 1,
        }}
      >
        {active ? <Ionicons name="checkmark" size={14} color={color} /> : null}
        <Text style={{ color: active ? color : theme.colors.fg, fontWeight: active ? "700" : "500" }}>{text}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 12 }}>
      {groups.map((g) => (
        <View key={g.title ?? "all"} style={{ gap: 6 }}>
          {g.title ? <Muted style={{ fontSize: 12, fontWeight: "700" }}>{g.title === "Improve" ? "To improve" : g.title}</Muted> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {g.items.map((c) => chip(c.text, c.category === "Positive" ? "positive" : c.category === "Improve" ? "improve" : "neutral"))}
          </View>
        </View>
      ))}
      {extra.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{extra.map((t) => chip(t, "neutral"))}</View> : null}
    </View>
  );
}

// ───────── Screen ─────────

export default function ScoreTeamScreen() {
  const { eventId, teamId, roundId } = useLocalSearchParams<{ eventId: string; teamId: string; roundId: string }>();
  const { theme } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<JudgePayload | null>(null);
  const [team, setTeam] = useState<JudgeTeam | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [restored, setRestored] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const ready = useRef(false);

  const load = useCallback(async () => {
    try {
      const p = await Api.judgeEvent(eventId, roundId);
      const t = p.teams.find((x) => x.id === teamId) ?? null;
      setPayload(p);
      setTeam(t);
      if (t) {
        const server: Omit<ScoreDraft, "updatedAt"> = {
          values: Object.fromEntries(t.myScores.map((s) => [s.criterionId, s.value])),
          criterionComments: Object.fromEntries(t.myScores.filter((s) => s.comment).map((s) => [s.criterionId, s.comment as string])),
          comment: t.myReview?.comment ?? "",
          tags: t.myReview?.tags ?? [],
          recommend: t.myReview?.recommend ?? null,
        };
        let use = server;
        const editable = t.status !== "SUBMITTED" && roundState(p.round) === "open";
        if (editable) {
          const local = await loadDraft(roundId, teamId);
          if (local && JSON.stringify({ ...local, updatedAt: undefined }) !== JSON.stringify({ ...server, updatedAt: undefined })) {
            use = local;
            setRestored(true);
            setDirty(true);
          }
        } else {
          await clearDraft(roundId, teamId);
        }
        setValues(use.values);
        setNotes(use.criterionComments);
        setComment(use.comment);
        setTags(use.tags);
        setRecommend(use.recommend);
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load this team");
    } finally {
      setLoading(false);
      ready.current = true;
    }
  }, [eventId, roundId, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const roundOpen = roundState(payload?.round) === "open";
  const submitted = team?.status === "SUBMITTED";
  const locked = submitted || !roundOpen;
  const criteria = payload?.criteria ?? [];

  // Autosave to the phone whenever marks change (debounced).
  useEffect(() => {
    if (!ready.current || locked || !dirty) return;
    const timer = setTimeout(() => {
      saveDraft(roundId, teamId, { values, criterionComments: notes, comment, tags, recommend });
    }, 400);
    return () => clearTimeout(timer);
  }, [values, notes, comment, tags, recommend, locked, dirty, roundId, teamId]);

  const touch = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (v: React.SetStateAction<T>) => {
    setDirty(true);
    setter(v);
  };
  const setValuesD = touch(setValues);
  const setNotesD = touch(setNotes);
  const setCommentD = touch(setComment);
  const setTagsD = touch(setTags);
  const setRecommendD = touch(setRecommend);

  const scoredCount = criteria.filter((c) => values[c.id] !== undefined).length;
  const complete = criteria.length > 0 && scoredCount === criteria.length;

  /** Weighted total out of 100: each criterion normalised to its maxScore, weighted. */
  const total = useMemo(() => {
    let weightSum = 0;
    let got = 0;
    for (const c of criteria) {
      if (!c.maxScore) continue;
      weightSum += c.weight;
      got += ((values[c.id] ?? 0) / c.maxScore) * c.weight;
    }
    return weightSum ? Math.round((got / weightSum) * 1000) / 10 : 0;
  }, [criteria, values]);

  async function save(submit: boolean) {
    if (!team) return;
    setSaving(submit ? "submit" : "draft");
    setError(null);
    try {
      await Api.saveScores({
        roundId,
        teamId,
        submit,
        scores: criteria
          .filter((c) => values[c.id] !== undefined)
          .map((c) => ({ criterionId: c.id, value: values[c.id], ...(notes[c.id]?.trim() ? { comment: notes[c.id].trim() } : {}) })),
        review: {
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          tags,
          ...(recommend !== null ? { recommend } : {}),
        },
      });
      setDirty(false);
      setRestored(false);
      if (submit) {
        await clearDraft(roundId, teamId);
        setTeam((t) => (t ? { ...t, status: "SUBMITTED" } : t));
        Alert.alert("Marks submitted", `${team.name}: ${fmt(total)} / 100`, [
          { text: "Stay here", style: "cancel" },
          { text: "Back to teams", onPress: () => router.back() },
        ]);
      } else {
        await saveDraft(roundId, teamId, { values, criterionComments: notes, comment, tags, recommend });
        setTeam((t) => (t ? { ...t, status: "DRAFT" } : t));
        Alert.alert("Draft saved", "Saved to the server. You can change it until you submit.");
      }
    } catch (e: any) {
      setError(
        submit
          ? `${e?.message ?? "Couldn't submit"} — your marks are kept on this phone.`
          : `${e?.message ?? "Couldn't save"} — your marks are kept on this phone; try again when you're online.`,
      );
    } finally {
      setSaving(null);
    }
  }

  function confirmSubmit() {
    const recLine = recommend === true ? "\nRecommended for the next round." : recommend === false ? "\nNot recommended for the next round." : "";
    Alert.alert(
      "Submit marks?",
      `${team?.name}: ${fmt(total)} / 100${recLine}\n\nMarks are locked after you submit and can't be changed.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Submit", style: "default", onPress: () => save(true) },
      ],
    );
  }

  if (loading) return <Loading />;
  if (!team)
    return (
      <SafeAreaView edges={[]} style={{ flex: 1, padding: 16, backgroundColor: theme.colors.bg }}>
        <ErrorBanner message={error ?? "This team isn't in your list for this round."} onRetry={load} />
      </SafeAreaView>
    );

  const hasAnything = scoredCount > 0 || !!comment.trim() || tags.length > 0 || recommend !== null;

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ title: team.name }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} /> : null}

          {submitted ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: STATUS_COLORS.successBg, marginBottom: 12 }}>
              <Ionicons name="lock-closed" size={18} color={STATUS_COLORS.success} />
              <Text style={{ color: STATUS_COLORS.success, fontWeight: "600", flex: 1 }}>Submitted and locked.</Text>
            </View>
          ) : !roundOpen ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: withAlpha(theme.colors.muted, 0.12), marginBottom: 12 }}>
              <Ionicons name="eye-outline" size={18} color={theme.colors.muted} />
              <Text style={{ color: theme.colors.muted, fontWeight: "600", flex: 1 }}>
                {payload?.round?.name ?? "This round"} isn't open, so marks are read-only.
              </Text>
            </View>
          ) : restored ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: 10, backgroundColor: STATUS_COLORS.warningBg, marginBottom: 12 }}>
              <Ionicons name="phone-portrait-outline" size={18} color={STATUS_COLORS.warning} />
              <Text style={{ color: STATUS_COLORS.warning, fontWeight: "600", flex: 1 }}>
                Restored marks saved on this phone. Save or submit to send them.
              </Text>
            </View>
          ) : null}

          <TeamInfo team={team} />

          <SectionHeader right={<Muted>{scoredCount}/{criteria.length} scored</Muted>}>
            {payload?.round?.name ? `${payload.round.name} · parameters` : "Parameters"}
          </SectionHeader>
          {criteria.length === 0 ? <Muted>The organiser hasn't set up judging parameters for this round yet.</Muted> : null}
          {criteria.map((c) => (
            <CriterionCard
              key={c.id}
              criterion={c}
              value={values[c.id]}
              note={notes[c.id] ?? ""}
              locked={locked}
              onChange={(v) => setValuesD((prev) => ({ ...prev, [c.id]: v }))}
              onNote={(s) => setNotesD((prev) => ({ ...prev, [c.id]: s }))}
            />
          ))}

          <SectionHeader>Overall remarks</SectionHeader>
          <Card style={{ gap: 14 }}>
            {payload?.comments.length ? (
              <CommentChips
                comments={payload.comments}
                selected={tags}
                locked={locked}
                onToggle={(text) => setTagsD((prev) => (prev.includes(text) ? prev.filter((x) => x !== text) : [...prev, text]))}
              />
            ) : null}
            <Input
              label="Comment for the team (optional)"
              value={comment}
              onChangeText={setCommentD}
              multiline
              editable={!locked}
              placeholder="Strengths, what to improve…"
              style={{ minHeight: 90 }}
            />
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: theme.colors.fg }}>Recommend for next round</Text>
                <Muted style={{ fontSize: 12 }}>Helps the organiser shortlist teams.</Muted>
              </View>
              <Switch
                value={recommend === true}
                disabled={locked}
                onValueChange={(v) => setRecommendD(v)}
                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              />
            </Row>
          </Card>
        </ScrollView>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 10,
            gap: 10,
          }}
        >
          <Row style={{ justifyContent: "space-between" }}>
            <Muted>Weighted total</Muted>
            <Text style={{ fontSize: 24, fontWeight: "800", color: theme.colors.primary }}>
              {fmt(total)} <Text style={{ fontSize: 15, color: theme.colors.muted }}>/ 100</Text>
            </Text>
          </Row>
          {!locked ? (
            <Row>
              <Button
                title="Save draft"
                icon="save-outline"
                variant="secondary"
                onPress={() => save(false)}
                loading={saving === "draft"}
                disabled={!hasAnything || !!saving}
                style={{ flex: 1 }}
              />
              <Button
                title={complete ? "Submit" : `Score all (${scoredCount}/${criteria.length})`}
                icon="checkmark-done"
                onPress={confirmSubmit}
                loading={saving === "submit"}
                disabled={!complete || !!saving}
                style={{ flex: 1.3 }}
              />
            </Row>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
