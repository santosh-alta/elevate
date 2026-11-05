import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useIsFocused } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import { Api, CheckinResult, extractTicketCode } from "../../src/api";
import { useSession } from "../../src/session";
import { STATUS_COLORS } from "../../src/theme";
import { Button, Input, Muted, Row, Screen, Title, formatDate } from "../../src/ui";

type Outcome =
  | { kind: "success"; result: CheckinResult }
  | { kind: "already"; result: CheckinResult }
  | { kind: "error"; message: string; code: string };

function ResultPanel({ outcome, onNext }: { outcome: Outcome; onNext: () => void }) {
  const palette =
    outcome.kind === "success"
      ? { bg: STATUS_COLORS.success, icon: "checkmark-circle" as const, title: "Checked in" }
      : outcome.kind === "already"
        ? { bg: STATUS_COLORS.warning, icon: "alert-circle" as const, title: "Already checked in" }
        : { bg: STATUS_COLORS.danger, icon: "close-circle" as const, title: "Not valid" };
  const result = outcome.kind === "error" ? null : outcome.result;

  return (
    <View style={{ backgroundColor: palette.bg, borderRadius: 20, padding: 24, alignItems: "center", gap: 8 }}>
      <Ionicons name={palette.icon} size={88} color="#fff" />
      <Text style={{ color: "#fff", fontSize: 28, fontWeight: "800" }}>{palette.title}</Text>
      {result ? (
        <>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", textAlign: "center" }}>{result.user?.name}</Text>
          <Text style={{ color: "#ffffffcc" }}>{result.user?.email}</Text>
          {result.registration?.event?.title ? (
            <Text style={{ color: "#ffffffcc", textAlign: "center" }}>{result.registration.event.title}</Text>
          ) : null}
          {outcome.kind === "already" && result.registration?.checkedInAt ? (
            <Text style={{ color: "#fff" }}>at {formatDate(result.registration.checkedInAt)}</Text>
          ) : null}
        </>
      ) : (
        <Text style={{ color: "#fff", textAlign: "center", fontSize: 16 }}>
          {outcome.kind === "error" ? outcome.message : ""}
          {"\n"}
          <Text style={{ fontFamily: "monospace" }}>{outcome.kind === "error" ? outcome.code : ""}</Text>
        </Text>
      )}
      <Button title="Scan next" icon="scan" variant="ghost" onPress={onNext} style={{ marginTop: 12, backgroundColor: "#fff", alignSelf: "stretch" }} />
    </View>
  );
}

export default function CheckinScreen() {
  const { theme } = useSession();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const lock = useRef(false);

  const checkIn = useCallback(async (raw: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const code = extractTicketCode(raw);
    try {
      const result = await Api.checkin(code);
      if (result.alreadyCheckedIn) setOutcome({ kind: "already", result });
      else {
        setOutcome({ kind: "success", result });
        setCount((c) => c + 1);
      }
    } catch (e: any) {
      setOutcome({ kind: "error", message: e.status === 404 ? "Ticket not found for this brand." : e.message, code });
    } finally {
      setBusy(false);
    }
  }, []);

  function next() {
    setOutcome(null);
    setManual("");
    lock.current = false;
  }

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Title subtitle={count > 0 ? `${count} checked in this session` : "Scan a participant's ticket QR."}>Check-in</Title>
        <Button title="Ops" icon="construct-outline" variant="secondary" size="sm" onPress={() => router.push("/ops")} />
      </Row>

      {outcome ? (
        <ResultPanel outcome={outcome} onNext={next} />
      ) : (
        <View style={{ borderRadius: 20, overflow: "hidden", height: 340, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
          {!permission ? null : !permission.granted ? (
            <View style={{ alignItems: "center", padding: 24, gap: 12 }}>
              <Ionicons name="camera-outline" size={48} color="#fff" />
              <Text style={{ color: "#fff", textAlign: "center" }}>Camera access is needed to scan tickets.</Text>
              <Button title="Allow camera" onPress={requestPermission} />
            </View>
          ) : focused ? (
            <>
              <CameraView
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={busy ? undefined : ({ data }) => data && checkIn(data)}
              />
              <View style={{ width: 220, height: 220, borderWidth: 3, borderColor: theme.colors.primaryFg, borderRadius: 24, opacity: 0.9 }} />
            </>
          ) : null}
        </View>
      )}

      <View style={{ marginTop: 20 }}>
        <Muted style={{ marginBottom: 8 }}>QR not scanning? Enter the ticket code.</Muted>
        <Input value={manual} onChangeText={setManual} placeholder="Ticket code" autoCapitalize="none" autoCorrect={false} />
        <Button
          title="Check in"
          icon="enter-outline"
          variant="secondary"
          loading={busy}
          disabled={!manual.trim()}
          onPress={() => {
            Keyboard.dismiss();
            lock.current = false;
            checkIn(manual);
          }}
        />
      </View>
    </Screen>
  );
}
