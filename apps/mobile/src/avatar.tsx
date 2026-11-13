import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { absoluteUrl } from "./api";
import { useSession } from "./session";
import { withAlpha } from "./theme";

const initialsOf = (name?: string | null) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Profile photo (from Google/GitHub sign-in or an upload); initials when there's none or it fails to load. */
export function Avatar({ name, url, size = 40, ring }: { name?: string | null; url?: string | null; size?: number; ring?: boolean }) {
  const { theme } = useSession();
  const [failed, setFailed] = useState(false);
  const border = ring ? { borderWidth: 3, borderColor: theme.colors.card } : null;
  if (url && !failed) {
    return (
      <Image
        source={{ uri: absoluteUrl(url) }}
        onError={() => setFailed(true)}
        accessibilityLabel={name ?? "Profile photo"}
        style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(theme.colors.primary, 0.1) }, border]}
      />
    );
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(theme.colors.primary, 0.15), alignItems: "center", justifyContent: "center" }, border]}>
      <Text style={{ fontSize: size * 0.36, fontWeight: "800", color: theme.colors.primary }}>{initialsOf(name)}</Text>
    </View>
  );
}
