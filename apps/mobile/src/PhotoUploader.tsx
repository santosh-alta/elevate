// Take or pick photos and upload them to the event (POST /uploads, kind=PHOTO),
// with per-photo progress, retry, and a grid of the event's recent uploads.
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Platform, Pressable, Text, View } from "react-native";
import { Api, LocalFile, MediaItem } from "./api";
import { useSession } from "./session";
import { STATUS_COLORS, withAlpha } from "./theme";
import { Button, Card, Input, Muted, ProgressBar, Row } from "./ui";

type UploadState = "queued" | "uploading" | "done" | "error";

interface UploadItem {
  key: string;
  file: LocalFile;
  caption?: string;
  progress: number;
  state: UploadState;
  error?: string;
}

const PHOTO_KINDS = new Set(["PHOTO", "GUEST_PHOTO", "POSTER"]);

function toLocalFile(asset: ImagePicker.ImagePickerAsset, index: number): LocalFile {
  const mimeType = asset.mimeType ?? "image/jpeg";
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return { uri: asset.uri, name: asset.fileName ?? `event-photo-${Date.now()}-${index}.${ext}`, mimeType };
}

async function ensurePermission(kind: "camera" | "library"): Promise<boolean> {
  const current =
    kind === "camera" ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const asked =
    current.canAskAgain !== false
      ? kind === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
      : current;
  if (asked.granted) return true;
  Alert.alert(
    kind === "camera" ? "Camera access needed" : "Photo access needed",
    kind === "camera"
      ? "Allow camera access in Settings to take event photos."
      : "Allow photo library access in Settings to upload event photos.",
    [
      { text: "Not now", style: "cancel" },
      ...(Platform.OS !== "web" ? [{ text: "Open Settings", onPress: () => Linking.openSettings() }] : []),
    ],
  );
  return false;
}

export function PhotoUploader({ eventId }: { eventId: string }) {
  const { theme } = useSession();
  const [caption, setCaption] = useState("");
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [recent, setRecent] = useState<MediaItem[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const running = useRef(false);
  const queueRef = useRef<UploadItem[]>([]);
  queueRef.current = queue;

  const loadRecent = useCallback(async () => {
    try {
      const media = await Api.eventMedia(eventId);
      setRecent(media.filter((m) => PHOTO_KINDS.has(m.kind)).slice(0, 18));
      setRecentError(null);
    } catch (e: any) {
      setRecentError(e.message);
    }
  }, [eventId]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const patch = (key: string, change: Partial<UploadItem>) =>
    setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...change } : it)));

  // Upload one photo at a time so slow campus Wi-Fi isn't flooded.
  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let uploadedAny = false;
    try {
      for (;;) {
        const next = queueRef.current.find((it) => it.state === "queued");
        if (!next) break;
        patch(next.key, { state: "uploading", progress: 0, error: undefined });
        queueRef.current = queueRef.current.map((it) => (it.key === next.key ? { ...it, state: "uploading" } : it));
        try {
          const result = await Api.uploadPhoto(eventId, next.file, next.caption, (p) => patch(next.key, { progress: p }));
          patch(next.key, { state: "done", progress: 1 });
          queueRef.current = queueRef.current.map((it) => (it.key === next.key ? { ...it, state: "done" } : it));
          uploadedAny = true;
          if (result.media) setRecent((r) => [result.media!, ...(r ?? [])].slice(0, 18));
        } catch (e: any) {
          patch(next.key, { state: "error", error: e.message });
          queueRef.current = queueRef.current.map((it) => (it.key === next.key ? { ...it, state: "error" } : it));
        }
      }
    } finally {
      running.current = false;
      if (uploadedAny) loadRecent();
    }
  }, [eventId, loadRecent]);

  function enqueue(files: LocalFile[]) {
    if (files.length === 0) return;
    const text = caption.trim() || undefined;
    const items: UploadItem[] = files.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      caption: text,
      progress: 0,
      state: "queued",
    }));
    queueRef.current = [...items, ...queueRef.current];
    setQueue(queueRef.current);
    setCaption("");
    setTimeout(pump, 0);
  }

  async function takePhoto() {
    if (Platform.OS !== "web" && !(await ensurePermission("camera"))) return;
    try {
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, exif: false });
      if (!res.canceled) enqueue(res.assets.map(toLocalFile));
    } catch (e: any) {
      Alert.alert("Camera unavailable", e?.message ?? "Couldn't open the camera on this device.");
    }
  }

  async function pickPhotos() {
    if (Platform.OS !== "web" && !(await ensurePermission("library"))) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 30,
        quality: 0.8,
        exif: false,
      });
      if (!res.canceled) enqueue(res.assets.map(toLocalFile));
    } catch (e: any) {
      Alert.alert("Couldn't open your photos", e?.message ?? "Please try again.");
    }
  }

  function retry(key: string) {
    queueRef.current = queueRef.current.map((it) => (it.key === key ? { ...it, state: "queued", progress: 0 } : it));
    setQueue(queueRef.current);
    setTimeout(pump, 0);
  }

  const active = queue.filter((it) => it.state !== "done");
  const doneCount = queue.filter((it) => it.state === "done").length;
  const failed = queue.filter((it) => it.state === "error").length;

  return (
    <>
      <Card style={{ gap: 12 }}>
        <Text style={{ fontWeight: "700", color: theme.colors.fg, fontSize: 16 }}>Upload event photos</Text>
        <Muted>Photos go straight to this event's gallery, where the social media team can pick them up.</Muted>
        <Input label="Caption (optional, applies to the next photos)" value={caption} onChangeText={setCaption} placeholder="e.g. Chief guest with the winners" />
        <Row>
          <Button title="Take photo" icon="camera" onPress={takePhoto} style={{ flex: 1 }} />
          <Button title="From gallery" icon="images" variant="secondary" onPress={pickPhotos} style={{ flex: 1 }} />
        </Row>

        {queue.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Muted style={{ fontSize: 13 }}>
              {doneCount} of {queue.length} uploaded{failed ? ` · ${failed} failed` : ""}
            </Muted>
            {active.map((it) => (
              <Row key={it.key} style={{ gap: 10 }}>
                <Image source={{ uri: it.file.uri }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={1} style={{ color: theme.colors.fg, fontSize: 13 }}>
                    {it.caption ?? it.file.name}
                  </Text>
                  {it.state === "error" ? (
                    <Text numberOfLines={2} style={{ color: STATUS_COLORS.danger, fontSize: 12 }}>
                      {it.error ?? "Upload failed"}
                    </Text>
                  ) : (
                    <ProgressBar value={it.state === "queued" ? 0 : it.progress} />
                  )}
                </View>
                {it.state === "error" ? (
                  <Pressable onPress={() => retry(it.key)} accessibilityRole="button" accessibilityLabel="Retry upload" hitSlop={8} style={{ padding: 6 }}>
                    <Ionicons name="refresh" size={20} color={theme.colors.primary} />
                  </Pressable>
                ) : (
                  <Muted style={{ fontSize: 12, width: 40, textAlign: "right" }}>
                    {it.state === "queued" ? "Waiting" : `${Math.round(it.progress * 100)}%`}
                  </Muted>
                )}
              </Row>
            ))}
            {doneCount > 0 && active.length === 0 ? (
              <Row>
                <Ionicons name="checkmark-circle" size={18} color={STATUS_COLORS.success} />
                <Text style={{ color: STATUS_COLORS.success, fontWeight: "700" }}>All photos uploaded</Text>
              </Row>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "700", color: theme.colors.fg }}>Recent uploads</Text>
          <Pressable onPress={loadRecent} accessibilityRole="button" accessibilityLabel="Refresh recent uploads" hitSlop={8}>
            <Ionicons name="refresh" size={18} color={theme.colors.muted} />
          </Pressable>
        </Row>
        {recentError ? (
          <Muted style={{ color: STATUS_COLORS.danger }}>{recentError}</Muted>
        ) : recent === null ? (
          <Muted>Loading…</Muted>
        ) : recent.length === 0 ? (
          <Muted>No photos yet. Be the first to add one.</Muted>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {recent.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => WebBrowser.openBrowserAsync(m.url).catch(() => Linking.openURL(m.url))}
                accessibilityRole="imagebutton"
                accessibilityLabel={m.caption ?? m.title ?? "Event photo"}
                style={{ width: "32%", aspectRatio: 1, borderRadius: 8, overflow: "hidden", backgroundColor: withAlpha(theme.colors.primary, 0.08) }}
              >
                <Image source={{ uri: m.url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                {m.isHighlight ? (
                  <View style={{ position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, padding: 3 }}>
                    <Ionicons name="star" size={12} color="#fbbf24" />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </Card>
    </>
  );
}
