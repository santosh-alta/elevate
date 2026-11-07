import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Alert, Share, Text, View } from "react-native";
import { AWARD_LABELS, Api, Team } from "../../src/api";
import { HtmlContent } from "../../src/html";
import { useSession } from "../../src/session";
import { STATUS_COLORS, withAlpha } from "../../src/theme";
import { Badge, Body, Button, Card, EmptyState, ErrorBanner, IconName, Loading, Muted, Row, Screen, SectionHeader, formatDate, humanize, useFocusData } from "../../src/ui";

function openUrl(url: string) {
  if (/^https?:\/\//.test(url)) WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
  else Linking.openURL(url).catch(() => Alert.alert("Can't open link", url));
}

function LinkRow({ icon, label, url }: { icon: IconName; label: string; url?: string | null }) {
  const { theme } = useSession();
  if (!url) return null;
  return (
    <Card onPress={() => openUrl(url)} style={{ paddingVertical: 12, marginBottom: 8 }}>
      <Row>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "600", color: theme.colors.fg }}>{label}</Text>
          <Muted numberOfLines={1} style={{ fontSize: 12 }}>
            {url}
          </Muted>
        </View>
        <Ionicons name="open-outline" size={16} color={theme.colors.muted} />
      </Row>
    </Card>
  );
}

function submissionState(team: Team, closesAt?: string | null): { label: string; tone: "success" | "warning" | "neutral"; note: string } {
  if (team.submittedAt) return { label: "Submitted", tone: "success", note: `Locked ${formatDate(team.submittedAt)}` };
  const hasDraft = team.projectTitle || team.repoUrl || team.demoUrl || team.deckUrl || team.videoUrl || team.attachments.length;
  const deadline = closesAt ? ` Submissions close ${formatDate(closesAt)}.` : "";
  if (hasDraft) return { label: "Draft", tone: "warning", note: `Not submitted yet.${deadline}` };
  return { label: "Not started", tone: "neutral", note: `Nothing submitted yet.${deadline}` };
}

export default function MyTeamScreen() {
  const { eventId, teamId } = useLocalSearchParams<{ eventId: string; teamId?: string }>();
  const { theme, user } = useSession();

  const { data, error, loading, refreshing, refresh, reload } = useFocusData(async () => {
    const event = await Api.event(eventId);
    const id = teamId ?? event.myTeam?.id;
    let team: Team | null = null;
    if (id) team = await Api.team(id).catch(() => event.myTeam);
    else team = await Api.myTeam(event.id).catch(() => null);
    return { event, team };
  }, [eventId, teamId]);

  if (loading) return <Loading />;
  if (!data)
    return (
      <Screen edges={[]}>
        <ErrorBanner message={error ?? "Couldn't load your team"} onRetry={refresh} />
      </Screen>
    );

  const { event, team } = data;
  const webUrl = Api.teamOnWebUrl(event.slug);

  async function openWeb(url: string | null) {
    if (!url) return Alert.alert("Not available", "Open the event on the website to manage your team.");
    try {
      await WebBrowser.openBrowserAsync(url);
    } finally {
      reload();
    }
  }

  if (!team)
    return (
      <Screen edges={[]} refreshing={refreshing} onRefresh={refresh}>
        <Stack.Screen options={{ title: "My team" }} />
        {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
        <EmptyState
          icon="people-outline"
          title="You're not in a team yet"
          message={`Create a team or join one with an invite code for ${event.title} on the website.`}
          action={<Button title="Form a team on web" icon="open-outline" onPress={() => openWeb(webUrl)} />}
        />
      </Screen>
    );

  const me = team.members.find((m) => m.userId === user?.id || (m.email && m.email === user?.email));
  const sub = submissionState(team, event.submissionsCloseAt);
  const payStatus = team.payment?.status ?? team.paymentStatus;

  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: team.name }} />
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      <Card style={{ gap: 8 }}>
        <Muted>{event.title}</Muted>
        <Text style={{ fontSize: 24, fontWeight: "800", color: theme.colors.fg }}>{team.name}</Text>
        <Row style={{ flexWrap: "wrap" }}>
          <Badge label={sub.label} tone={sub.tone} />
          {team.award ? <Badge label={AWARD_LABELS[team.award] ?? humanize(team.award)} tone="warning" /> : null}
          {payStatus ? (
            <Badge
              label={payStatus === "PAID" ? "Paid" : payStatus === "CREATED" ? "Payment pending" : humanize(payStatus)}
              tone={payStatus === "PAID" ? "success" : payStatus === "CREATED" ? "warning" : "neutral"}
            />
          ) : null}
        </Row>
        {team.inviteCode && me?.isLeader ? (
          <Row>
            <Muted>Invite code</Muted>
            <Text selectable style={{ fontFamily: "monospace", fontWeight: "700", color: theme.colors.fg, letterSpacing: 1 }}>
              {team.inviteCode}
            </Text>
            <Ionicons
              name="share-outline"
              size={18}
              color={theme.colors.primary}
              onPress={() => Share.share({ message: `Join my team "${team.name}" for ${event.title} with invite code ${team.inviteCode}` })}
            />
          </Row>
        ) : null}
      </Card>

      <SectionHeader right={<Muted>{team.members.length}</Muted>}>Members</SectionHeader>
      <Card style={{ gap: 10 }}>
        {team.members.map((m, i) => (
          <Row key={m.userId ?? `${m.name}-${i}`} style={{ gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: withAlpha(theme.colors.primary, 0.12), alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>{m.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600", color: theme.colors.fg }}>
                {m.name}
                {m === me ? " (you)" : ""}
              </Text>
              {m.email ? <Muted style={{ fontSize: 12 }}>{m.email}</Muted> : null}
            </View>
            {m.isLeader ? <Badge label="Leader" tone="primary" /> : null}
          </Row>
        ))}
      </Card>

      {team.problemStatement ? (
        <>
          <SectionHeader>Problem statement</SectionHeader>
          <Card style={{ gap: 8 }}>
            <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg }}>
              {[team.problemStatement.code, team.problemStatement.title].filter(Boolean).join(" · ")}
            </Text>
            <HtmlContent html={team.problemStatement.html} compact />
          </Card>
        </>
      ) : null}

      <SectionHeader>Submission</SectionHeader>
      <Card style={{ gap: 8 }}>
        <Row>
          <Ionicons
            name={team.submittedAt ? "checkmark-circle" : "time-outline"}
            size={20}
            color={team.submittedAt ? STATUS_COLORS.success : STATUS_COLORS.warning}
          />
          <Text style={{ flex: 1, color: theme.colors.fg, fontWeight: "600" }}>{sub.note}</Text>
        </Row>
        {team.projectTitle ? <Text style={{ fontWeight: "800", fontSize: 18, color: theme.colors.fg }}>{team.projectTitle}</Text> : null}
        {team.projectSummary ? <Body>{team.projectSummary}</Body> : null}
        {team.techStack.length ? (
          <Row style={{ flexWrap: "wrap", gap: 6 }}>
            {team.techStack.map((s) => (
              <Badge key={s} label={s} />
            ))}
          </Row>
        ) : null}
      </Card>
      <LinkRow icon="logo-github" label="GitHub repo" url={team.repoUrl} />
      <LinkRow icon="globe-outline" label="Live demo" url={team.demoUrl} />
      <LinkRow icon="easel-outline" label="Pitch deck" url={team.deckUrl} />
      <LinkRow icon="play-circle-outline" label="Demo video" url={team.videoUrl} />
      {team.attachments.map((a, i) => (
        <LinkRow key={`${a.url}-${i}`} icon={a.kind === "file" ? "document-attach-outline" : "link-outline"} label={a.label} url={a.url} />
      ))}

      {!team.submittedAt ? (
        <Button title="Edit submission on web" icon="open-outline" onPress={() => openWeb(webUrl)} style={{ marginTop: 4 }} />
      ) : (
        <Button title="View on web" icon="open-outline" variant="secondary" onPress={() => openWeb(webUrl)} style={{ marginTop: 4 }} />
      )}

      {team.feedback.length > 0 ? (
        <>
          <SectionHeader>Judges' feedback</SectionHeader>
          {team.feedback.map((f, i) => (
            <Card key={`${f.roundName}-${i}`} style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "700", color: theme.colors.fg }}>{f.roundName}</Text>
                {f.averageScore != null ? <Badge label={`${Math.round(f.averageScore * 10) / 10} / 100`} tone="primary" /> : null}
              </Row>
              {f.tags.length ? (
                <Row style={{ flexWrap: "wrap", gap: 6 }}>
                  {f.tags.map((t) => (
                    <Badge key={t} label={t} />
                  ))}
                </Row>
              ) : null}
              {f.comments.map((c, k) => (
                <Body key={k}>“{c}”</Body>
              ))}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
