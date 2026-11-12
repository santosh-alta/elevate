import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { Redirect, router, useIsFocused, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Api, ApiError } from "../../src/api";
import { useSession } from "../../src/session";
import { STATUS_COLORS } from "../../src/theme";
import { Button, Muted, Screen } from "../../src/ui";

/**
 * Mark my attendance: scan the live QR shown on the screen at the venue (…/attend/<event>?t=<code>).
 * The code is swapped for a short pass; if the venue asks for it, the phone's location confirms you're there.
 */
type State =
  | { kind: "scan" }
  | { kind: "busy"; text: string }
  | { kind: "done"; already: boolean; title?: string; name?: string }
  | { kind: "error"; message: string };

function parseQr(data: string): { event: string; t: string } | null {
  try {
    const u = new URL(data);
    const m = u.pathname.match(/\/attend\/([^/?#]+)/);
    const t = u.searchParams.get("t");
    return m && t ? { event: decodeURIComponent(m[1]), t } : null;
  } catch {
    return null;
  }
}

export default function AttendScreen() {
  const { theme, status } = useSession();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<State>({ kind: "scan" });
  const lock = useRef(false);
  // Opened from a link (the venue QR scanned with the phone camera): …/attend/<event>?t=<code>
  const params = useLocalSearchParams<{ event?: string; t?: string }>();
  useEffect(() => {
    if (params.event && params.t) void onScan(`https://link/attend/${encodeURIComponent(params.event)}?t=${encodeURIComponent(params.t)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.event, params.t]);

  async function onScan(data: string) {
    if (lock.current) return;
    const qr = parseQr(data);
    if (!qr) return; // not a check-in QR; keep scanning
    lock.current = true;
    try {
      setState({ kind: "busy", text: "Checking the code…" });
      const start = await Api.attendStart(qr.event, qr.t);
      let coords: { lat: number; lng: number; accuracy?: number } | undefined;
      if (start.needsLocation) {
        setState({ kind: "busy", text: "Confirming you're at the venue…" });
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") throw new Error("Please allow location so we can confirm you're at the venue, or go to the help desk.");
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
      }
      setState({ kind: "busy", text: "Checking you in…" });
      const r = await Api.attend(start.event.slug ?? qr.event, start.pass, coords);
      setState({ kind: "done", already: r.status === "already", title: r.event?.title ?? start.event.title, name: r.name });
    } catch (e) {
      setState({ kind: "error", message: e instanceof ApiError || e instanceof Error ? e.message : "Couldn't check you in" });
    }
  }

  const reset = () => { lock.current = false; setState({ kind: "scan" }); };

  if (status === "signedOut") return <Redirect href="/login" />;
  if (!permission) return <Screen edges={[]}><Muted>Loading camera…</Muted></Screen>;
  if (!permission.granted) {
    return (
      <Screen edges={[]}>
        <View style={{ alignItems: "center", gap: 12, paddingVertical: 40 }}>
          <Ionicons name="camera-outline" size={56} color={theme.colors.primary} />
          <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.fg, textAlign: "center" }}>Scan the QR on the screen at the venue</Text>
          <Muted style={{ textAlign: "center" }}>We need the camera to read the check-in code. Nothing is recorded.</Muted>
          <Button title="Allow camera" icon="camera" onPress={requestPermission} />
        </View>
      </Screen>
    );
  }

  if (state.kind === "done" || state.kind === "error") {
    const ok = state.kind === "done";
    return (
      <Screen edges={[]}>
        <View style={{ backgroundColor: ok ? (state.already ? STATUS_COLORS.warning : STATUS_COLORS.success) : STATUS_COLORS.danger, borderRadius: 20, padding: 28, alignItems: "center", gap: 8 }}>
          <Ionicons name={ok ? "checkmark-circle" : "close-circle"} size={88} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", textAlign: "center" }}>{ok ? (state.already ? "Already checked in" : "You're checked in!") : "Couldn't check in"}</Text>
          {ok && state.title ? <Text style={{ color: "#fff", fontSize: 16, textAlign: "center" }}>{state.title}</Text> : null}
          {!ok ? <Text style={{ color: "#fff", fontSize: 15, textAlign: "center" }}>{state.message}</Text> : null}
        </View>
        <View style={{ gap: 10, marginTop: 16 }}>
          {ok ? <Button title="Done" icon="checkmark" onPress={() => router.back()} /> : <Button title="Scan again" icon="scan" onPress={reset} />}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]} scroll={false}>
      <Text style={{ fontSize: 16, color: theme.colors.fg, marginBottom: 12 }}>Point your camera at the check-in QR on the screen.</Text>
      <View style={{ flex: 1, borderRadius: 20, overflow: "hidden", backgroundColor: "#000" }}>
        {focused ? (
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={state.kind === "scan" ? ({ data }) => onScan(data) : undefined} />
        ) : null}
        {state.kind === "busy" ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: "rgba(0,0,0,0.6)" }}>
            <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>{state.text}</Text>
          </View>
        ) : null}
      </View>
      <Muted style={{ textAlign: "center", marginTop: 12, fontSize: 13 }}>The QR changes every 30 seconds, so scan it live at the venue.</Muted>
    </Screen>
  );
}
