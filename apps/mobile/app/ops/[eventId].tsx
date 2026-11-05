import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Api, EventTask } from "../../src/api";
import { useSession } from "../../src/session";
import { STATUS_COLORS } from "../../src/theme";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Input,
  Loading,
  Muted,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  formatDate,
  humanize,
  useFocusData,
} from "../../src/ui";

const PHASES: { key: EventTask["phase"]; label: string }[] = [
  { key: "PRE", label: "Before the event" },
  { key: "DURING", label: "On the day" },
  { key: "POST", label: "After the event" },
];

const MEDIA_KINDS = ["PHOTO_ALBUM", "PHOTO", "VIDEO", "POSTER", "GUEST_PHOTO", "DECK", "OTHER"] as const;

function TaskRow({ task, onToggle }: { task: EventTask; onToggle: () => void }) {
  const { theme } = useSession();
  const done = task.status === "DONE";
  const overdue = !done && task.dueAt && new Date(task.dueAt).getTime() < Date.now();
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={done ? "checkbox" : "square-outline"} size={24} color={done ? STATUS_COLORS.success : theme.colors.muted} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: done ? theme.colors.muted : theme.colors.fg, textDecorationLine: done ? "line-through" : "none", fontSize: 15 }}>
          {task.title}
        </Text>
        <Muted style={{ fontSize: 12, color: overdue ? STATUS_COLORS.danger : theme.colors.muted }}>
          {[task.dueAt ? `Due ${formatDate(task.dueAt, false)}` : null, task.assignee?.name].filter(Boolean).join(" · ")}
        </Muted>
      </View>
      {task.status === "IN_PROGRESS" || task.status === "BLOCKED" ? (
        <Badge label={humanize(task.status)} tone={task.status === "BLOCKED" ? "danger" : "warning"} />
      ) : null}
    </Pressable>
  );
}

export default function EventOpsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { theme } = useSession();
  const [drive, setDrive] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<(typeof MEDIA_KINDS)[number]>("PHOTO");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaTitle, setMediaTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, setData, error, loading, refreshing, refresh } = useFocusData(async () => {
    const [event, tasks] = await Promise.all([Api.event(eventId), Api.tasks(eventId).catch(() => [] as EventTask[])]);
    return { event, tasks };
  }, [eventId]);

  if (loading) return <Loading />;
  if (!data) return <Screen edges={[]}>{error ? <ErrorBanner message={error} onRetry={refresh} /> : null}</Screen>;

  const { event, tasks } = data;
  const driveValue = drive ?? event.driveFolderUrl ?? "";
  const doneCount = tasks.filter((t) => t.status === "DONE").length;

  async function toggle(task: EventTask) {
    const status = task.status === "DONE" ? "TODO" : "DONE";
    // Optimistic update
    setData({ event, tasks: tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) });
    try {
      await Api.updateTask(task.id, { status });
    } catch (e: any) {
      setData({ event, tasks });
      Alert.alert("Couldn't update task", e.message);
    }
  }

  async function saveDrive() {
    setBusy("drive");
    try {
      await Api.setDriveLink(eventId, driveValue.trim());
      setData({ event: { ...event, driveFolderUrl: driveValue.trim() }, tasks });
      Alert.alert("Saved", "Drive folder linked. The social media team can now pick up the photos.");
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function addMedia() {
    setBusy("media");
    try {
      await Api.addMedia(eventId, { kind: mediaKind, url: mediaUrl.trim(), ...(mediaTitle.trim() ? { title: mediaTitle.trim() } : {}) });
      setMediaUrl("");
      setMediaTitle("");
      Alert.alert("Added", `${humanize(mediaKind)} added to ${event.title}.`);
    } catch (e: any) {
      Alert.alert("Couldn't add media", e.message);
    } finally {
      setBusy(null);
    }
  }

  const isUrl = (v: string) => /^https?:\/\/\S+$/.test(v.trim());

  return (
    <Screen edges={["bottom"]} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: event.title }} />

      <Card style={{ gap: 8 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Badge label={humanize(event.status)} tone="primary" />
          <Muted>{formatDate(event.startsAt, false)}</Muted>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "700", color: theme.colors.fg }}>Checklist</Text>
          <Muted>
            {doneCount}/{tasks.length} done
          </Muted>
        </Row>
        <ProgressBar value={tasks.length ? doneCount / tasks.length : 0} />
      </Card>

      <SectionHeader>Photos & media</SectionHeader>
      <Card>
        <Input label="Google Drive folder (all event photos)" value={driveValue} onChangeText={setDrive} placeholder="https://drive.google.com/drive/folders/…" autoCapitalize="none" keyboardType="url" />
        <Button title={event.driveFolderUrl ? "Update Drive link" : "Save Drive link"} icon="logo-google" onPress={saveDrive} loading={busy === "drive"} disabled={!isUrl(driveValue)} />
      </Card>
      <Card>
        <Text style={{ fontWeight: "700", color: theme.colors.fg, marginBottom: 8 }}>Add a media link</Text>
        <Row style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {MEDIA_KINDS.map((k) => {
            const active = k === mediaKind;
            return (
              <Pressable
                key={k}
                onPress={() => setMediaKind(k)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: active ? theme.colors.primary : "transparent",
                }}
              >
                <Text style={{ color: active ? theme.colors.primaryFg : theme.colors.fg, fontSize: 13, fontWeight: "600" }}>{humanize(k)}</Text>
              </Pressable>
            );
          })}
        </Row>
        <Input label="Link" value={mediaUrl} onChangeText={setMediaUrl} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
        <Input label="Title (optional)" value={mediaTitle} onChangeText={setMediaTitle} placeholder="e.g. Chief guest with winners" />
        <Button title="Add media" icon="add-circle-outline" variant="secondary" onPress={addMedia} loading={busy === "media"} disabled={!isUrl(mediaUrl)} />
      </Card>

      {tasks.length === 0 ? (
        <>
          <SectionHeader>Checklist</SectionHeader>
          <Muted>No checklist for this event.</Muted>
        </>
      ) : (
        PHASES.map(({ key, label }) => {
          const phaseTasks = tasks.filter((t) => t.phase === key);
          if (phaseTasks.length === 0) return null;
          return (
            <View key={key}>
              <SectionHeader right={<Muted>{phaseTasks.filter((t) => t.status === "DONE").length}/{phaseTasks.length}</Muted>}>{label}</SectionHeader>
              <Card style={{ paddingVertical: 0 }}>
                {phaseTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} />
                ))}
              </Card>
            </View>
          );
        })
      )}
    </Screen>
  );
}
