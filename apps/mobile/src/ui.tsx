import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "./session";
import { STATUS_COLORS, isDark, withAlpha } from "./theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

// ───────── Data loading ─────────

/** Loads data whenever the screen gains focus; exposes pull-to-refresh state. */
export function useFocusData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async (mode: "initial" | "refresh" | "silent") => {
    if (mode === "refresh") setRefreshing(true);
    try {
      setData(await loaderRef.current());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      run(data === null ? "initial" : "silent");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps),
  );

  return { data, setData, error, loading, refreshing, refresh: () => run("refresh"), reload: () => run("silent") };
}

// ───────── Layout ─────────

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  padded = true,
  edges = ["top"],
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  // Screens that draw their own top edge sit on the light page; the others sit under the hero-coloured stack header.
  const ownTop = edges.includes("top");
  const barStyle = isDark(ownTop ? t.colors.bg : t.colors.heroBg) ? "light" : "dark";
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(barStyle, true);
    }, [barStyle]),
  );
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.padded, { paddingBottom: 32 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} colors={[t.colors.accent]} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.padded]}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: t.colors.bg }, style]}>
      {content}
    </SafeAreaView>
  );
}

export function Title({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.title, { color: t.colors.fg }]}>{children}</Text>
      {subtitle ? <Text style={{ color: t.colors.muted, marginTop: 4, fontSize: 15 }}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: t.colors.muted }]}>{children}</Text>
      {right}
    </View>
  );
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.colors.card,
    borderColor: t.colors.border,
    borderRadius: t.radius ?? 12,
  };
  if (!onPress) return <View style={[styles.card, base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, base, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }, style]}
    >
      {children}
    </Pressable>
  );
}

// ───────── Controls ─────────

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  size = "md",
}: {
  title: string;
  onPress?: () => void;
  /** primary = brand (e.g. navy), cta = call to action in the secondary brand colour (e.g. green with navy text) */
  variant?: "primary" | "cta" | "secondary" | "ghost" | "danger" | "success";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: "sm" | "md" | "lg";
}) {
  const t = useTheme();
  const palette = {
    primary: { bg: t.colors.primary, fg: t.colors.primaryFg, border: t.colors.primary },
    cta: { bg: t.colors.secondary, fg: t.colors.secondaryFg, border: t.colors.secondary },
    secondary: { bg: withAlpha(t.colors.primary, 0.1), fg: t.colors.primary, border: "transparent" },
    ghost: { bg: "transparent", fg: t.colors.primary, border: t.colors.border },
    danger: { bg: STATUS_COLORS.danger, fg: "#fff", border: STATUS_COLORS.danger },
    success: { bg: STATUS_COLORS.success, fg: "#fff", border: STATUS_COLORS.success },
  }[variant];
  const pad = size === "sm" ? 8 : size === "lg" ? 16 : 12;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderRadius: t.radius ?? 12,
          paddingVertical: pad,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === "sm" ? 16 : 18} color={palette.fg} /> : null}
          <Text style={{ color: palette.fg, fontWeight: variant === "cta" ? "700" : "600", fontSize: size === "sm" ? 14 : 16 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={[styles.label, { color: t.colors.fg }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.colors.muted}
        {...rest}
        style={[
          styles.input,
          {
            borderColor: t.colors.border,
            backgroundColor: t.colors.card,
            color: t.colors.fg,
            borderRadius: (t.radius ?? 12) - 2,
          },
          rest.multiline && { minHeight: 110, textAlignVertical: "top" },
          style as StyleProp<TextStyle>,
        ]}
      />
    </View>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "primary" | "success" | "warning" | "danger" }) {
  const t = useTheme();
  const colors = {
    neutral: { bg: withAlpha(t.colors.muted, 0.12), fg: t.colors.muted },
    primary: { bg: withAlpha(t.colors.primary, 0.12), fg: t.colors.primary },
    success: { bg: STATUS_COLORS.successBg, fg: STATUS_COLORS.success },
    warning: { bg: STATUS_COLORS.warningBg, fg: STATUS_COLORS.warning },
    danger: { bg: STATUS_COLORS.dangerBg, fg: STATUS_COLORS.danger },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={{ color: colors.fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: withAlpha(t.colors.primary, 0.12), overflow: "hidden" }}>
      <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: t.colors.accent, borderRadius: 4 }} />
    </View>
  );
}

// ───────── States ─────────

export function Loading() {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={t.colors.accent} />
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.center, { paddingVertical: 48 }]}>
      <View style={[styles.emptyIcon, { backgroundColor: withAlpha(t.colors.primary, 0.1) }]}>
        <Ionicons name={icon} size={32} color={t.colors.primary} />
      </View>
      <Text style={{ color: t.colors.fg, fontSize: 17, fontWeight: "600", marginTop: 16 }}>{title}</Text>
      {message ? (
        <Text style={{ color: t.colors.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>{message}</Text>
      ) : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.errorBanner]}>
      <Ionicons name="alert-circle" size={18} color={STATUS_COLORS.danger} />
      <Text style={{ color: STATUS_COLORS.danger, flex: 1 }}>{message}</Text>
      {onRetry ? (
        <Text onPress={onRetry} style={{ color: STATUS_COLORS.danger, fontWeight: "700" }}>
          Retry
        </Text>
      ) : null}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>{children}</View>;
}

export function Muted({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: t.colors.muted, fontSize: 14 }, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ color: t.colors.fg, fontSize: 15, lineHeight: 22 }, style]}>{children}</Text>;
}

// ───────── Formatting ─────────

export function formatDate(iso?: string | null, withTime = true): string {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (!withTime) return date;
  return `${date} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function humanize(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const styles = StyleSheet.create({
  padded: { padding: 16 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 12 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderWidth: 1 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: STATUS_COLORS.dangerBg,
    marginBottom: 12,
  },
});
