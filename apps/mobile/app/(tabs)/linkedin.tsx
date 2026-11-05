import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, Linking, Share, Text, View } from "react-native";
import { Api, LinkedInPost } from "../../src/api";
import { useSession } from "../../src/session";
import { Badge, Button, Card, EmptyState, ErrorBanner, Input, Loading, Muted, Row, Screen, Title, humanize, useFocusData } from "../../src/ui";

function PostCard({ post, onChange }: { post: LinkedInPost; onChange: (p: LinkedInPost) => void }) {
  const { theme } = useSession();
  const [draft, setDraft] = useState(post.draft);
  const [postUrl, setPostUrl] = useState(post.postUrl ?? "");
  const [askUrl, setAskUrl] = useState(false);
  const [busy, setBusy] = useState(false);
  const posted = post.status === "POSTED";
  const dirty = draft !== post.draft;

  async function save(body: Parameters<typeof Api.updateLinkedIn>[1]) {
    setBusy(true);
    try {
      const updated = await Api.updateLinkedIn(post.id, body);
      onChange({ ...post, ...body, ...(updated ?? {}) });
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (dirty) await save({ draft, status: "EDITED" });
    // LinkedIn's share composer accepts pre-filled text.
    const url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(draft)}`;
    try {
      await Linking.openURL(url);
    } catch {
      await Share.share({ message: draft });
    }
    setAskUrl(true);
  }

  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.fg, flex: 1 }}>{post.event?.title ?? "Event"}</Text>
        <Badge label={humanize(post.status)} tone={posted ? "success" : post.status === "SKIPPED" ? "neutral" : "primary"} />
      </Row>
      {post.generatedBy === "ai" ? (
        <Row>
          <Ionicons name="sparkles" size={14} color={theme.colors.muted} />
          <Muted style={{ fontSize: 12 }}>Drafted for you. Make it yours before posting.</Muted>
        </Row>
      ) : null}
      <Input value={draft} onChangeText={setDraft} multiline editable={!posted} />
      {posted ? (
        <Button title="View my post" icon="open-outline" variant="secondary" onPress={() => post.postUrl && Linking.openURL(post.postUrl)} disabled={!post.postUrl} />
      ) : (
        <>
          <Row>
            <Button title="Share on LinkedIn" icon="logo-linkedin" style={{ flex: 1 }} onPress={share} loading={busy} />
            <Button title="Copy / share" icon="share-outline" variant="secondary" onPress={() => Share.share({ message: draft })} />
          </Row>
          {dirty ? <Button title="Save edits" variant="ghost" size="sm" onPress={() => save({ draft, status: "EDITED" })} /> : null}
          {askUrl || post.status === "EDITED" ? (
            <View style={{ marginTop: 4 }}>
              <Input label="Posted? Paste your post link" value={postUrl} onChangeText={setPostUrl} placeholder="https://www.linkedin.com/posts/..." autoCapitalize="none" keyboardType="url" />
              <Button
                title="Mark as posted"
                icon="checkmark-circle"
                variant="success"
                disabled={!/^https?:\/\//.test(postUrl.trim())}
                onPress={() => save({ status: "POSTED", postUrl: postUrl.trim(), draft })}
              />
            </View>
          ) : (
            <Button title="I posted it" variant="ghost" size="sm" onPress={() => setAskUrl(true)} />
          )}
        </>
      )}
    </Card>
  );
}

export default function LinkedInScreen() {
  const { data, setData, error, loading, refreshing, refresh } = useFocusData(() => Api.myLinkedIn());
  const posts = data ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Title subtitle="Personalised post suggestions for the events you took part in.">LinkedIn posts</Title>
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
      {loading ? (
        <Loading />
      ) : posts.length === 0 ? (
        <EmptyState icon="logo-linkedin" title="No suggestions yet" message="After an event, a ready-to-post LinkedIn update appears here." />
      ) : (
        posts.map((p) => (
          <PostCard key={p.id} post={p} onChange={(np) => setData(posts.map((x) => (x.id === np.id ? np : x)))} />
        ))
      )}
    </Screen>
  );
}
