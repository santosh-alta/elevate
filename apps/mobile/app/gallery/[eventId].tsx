import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Api, MediaItem } from "../../src/api";
import { useSession } from "../../src/session";
import { EmptyState, ErrorBanner, Loading, Row } from "../../src/ui";

const COLUMNS = 3;
const GAP = 3;

function fileNameFor(m: MediaItem, i: number) {
  const fromUrl = m.url.split("?")[0].split("/").pop() ?? "";
  return /\.(jpe?g|png|webp|heic|gif)$/i.test(fromUrl) ? fromUrl : `photo-${m.id || i}.jpg`;
}

function Viewer({ items, index, onClose }: { items: MediaItem[]; index: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [current, setCurrent] = useState(index);
  const [busy, setBusy] = useState(false);
  const item = items[current];

  async function save() {
    if (!item) return;
    setBusy(true);
    try {
      // Opens the system viewer (Quick Look / Android viewer), which offers "Save image" / share.
      await Api.openPhoto(item.url, fileNameFor(item, current));
    } catch {
      try {
        await Share.share({ url: item.url, message: item.url });
      } catch {
        Alert.alert("Couldn't save photo", "Try again later.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!item) return;
    try {
      await Share.share({ url: item.url, message: item.caption ? `${item.caption}\n${item.url}` : item.url });
    } catch {
      // dismissed
    }
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={["portrait", "landscape"]}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(m) => m.id}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item: m }) => (
            <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
              <Image source={{ uri: m.url }} style={{ width, height: height * 0.8 }} resizeMode="contain" accessibilityLabel={m.caption ?? "Event photo"} />
            </View>
          )}
        />
        <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <Row style={{ justifyContent: "space-between", padding: 12 }}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 6 }}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Text style={{ color: "#fff", fontWeight: "600" }}>
              {current + 1} / {items.length}
            </Text>
            <View style={{ width: 40 }} />
          </Row>
        </SafeAreaView>
        <SafeAreaView edges={["bottom"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)" }}>
          {item?.caption ? (
            <Text style={{ color: "#fff", paddingHorizontal: 16, paddingTop: 10 }} numberOfLines={3}>
              {item.caption}
            </Text>
          ) : null}
          <Row style={{ justifyContent: "space-around", paddingVertical: 12 }}>
            <Pressable onPress={save} disabled={busy} accessibilityRole="button" style={{ alignItems: "center", gap: 4, padding: 6 }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="download-outline" size={24} color="#fff" />}
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Save to phone</Text>
            </Pressable>
            <Pressable onPress={share} accessibilityRole="button" style={{ alignItems: "center", gap: 4, padding: 6 }}>
              <Ionicons name="share-outline" size={24} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Share</Text>
            </Pressable>
          </Row>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export default function GalleryScreen() {
  const { eventId, start } = useLocalSearchParams<{ eventId: string; start?: string }>();
  const { theme } = useSession();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [title, setTitle] = useState("Photos");
  const opened = useRef(false);

  const loadFirst = useCallback(async () => {
    setError(null);
    try {
      const event = await Api.event(eventId).catch(() => null);
      if (event) setTitle(`Photos · ${event.title}`);
      try {
        const page = await Api.gallery(eventId);
        setItems(page.items);
        setCursor(page.nextCursor);
      } catch (e: any) {
        // Older servers: fall back to the photos embedded in the event detail.
        if (event?.gallery?.length) {
          setItems(event.gallery);
          setCursor(null);
        } else throw e;
      }
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load photos");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    if (!opened.current && start !== undefined && items.length > 0) {
      opened.current = true;
      setViewer(Math.min(items.length - 1, Math.max(0, Number(start) || 0)));
    }
  }, [items.length, start]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await Api.gallery(eventId, { cursor });
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...page.items.filter((m) => !seen.has(m.id))];
      });
      setCursor(page.nextCursor && page.nextCursor !== cursor ? page.nextCursor : null);
    } catch {
      setCursor(null);
    } finally {
      setLoadingMore(false);
    }
  }

  const size = (width - GAP * (COLUMNS + 1)) / COLUMNS;

  if (loading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ title }} />
      {error ? (
        <View style={{ padding: 16 }}>
          <ErrorBanner message={error} onRetry={loadFirst} />
        </View>
      ) : null}
      <FlatList
        data={items}
        numColumns={COLUMNS}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: GAP, gap: GAP }}
        columnWrapperStyle={{ gap: GAP }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={!error ? <EmptyState icon="images-outline" title="No photos yet" message="Photos from the event will show up here." /> : undefined}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={theme.colors.primary} /> : undefined}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => setViewer(index)} accessibilityLabel={item.caption ?? "Event photo"}>
            <Image source={{ uri: item.url }} style={{ width: size, height: size, backgroundColor: theme.colors.border }} />
          </Pressable>
        )}
      />
      {viewer !== null ? <Viewer items={items} index={viewer} onClose={() => setViewer(null)} /> : null}
    </View>
  );
}
