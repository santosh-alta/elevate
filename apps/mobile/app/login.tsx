import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Api, brand } from "../src/api";
import { useSession } from "../src/session";
import { withAlpha } from "../src/theme";
import { Button, ErrorBanner, Input, Muted, Screen } from "../src/ui";

export default function Login() {
  const { status, tenant, tenantError, theme, signIn, reloadTenant } = useSession();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signedIn") return <Redirect href="/(tabs)" />;

  const brandName = tenant?.name ?? brand.appName;

  async function requestCode() {
    const value = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(value)) return setError("Enter a valid email address.");
    setBusy(true);
    setError(null);
    try {
      const res = await Api.requestOtp(value, name.trim() || undefined);
      setEmail(value);
      setDevCode(res.devCode);
      setStep("code");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.trim().length < 4) return setError("Enter the code from your email.");
    setBusy(true);
    setError(null);
    try {
      const res = await Api.verifyOtp(email, code.trim());
      await signIn(res.token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ alignItems: "center", marginTop: 48, marginBottom: 32 }}>
          {theme.logoUrl ? (
            <Image source={{ uri: theme.logoUrl }} style={{ width: 160, height: 64 }} resizeMode="contain" />
          ) : (
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                backgroundColor: withAlpha(theme.colors.primary, 0.12),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="sparkles" size={36} color={theme.colors.primary} />
            </View>
          )}
          <Text style={{ fontSize: 26, fontWeight: "800", color: theme.colors.fg, marginTop: 20 }}>{brandName} Events</Text>
          <Muted style={{ marginTop: 6, textAlign: "center" }}>
            Hackathons, seminars and workshops: register, check in, get certified.
          </Muted>
        </View>

        {tenantError ? <ErrorBanner message={tenantError} onRetry={reloadTenant} /> : null}
        {error ? <ErrorBanner message={error} /> : null}

        {step === "email" ? (
          <>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@college.edu"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
            />
            <Input
              label="Name (first time only)"
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              autoComplete="name"
              returnKeyType="go"
              onSubmitEditing={requestCode}
            />
            <Button title="Send login code" icon="mail" onPress={requestCode} loading={busy} size="lg" />
          </>
        ) : (
          <>
            <Muted style={{ marginBottom: 12 }}>
              We sent a code to <Text style={{ fontWeight: "700", color: theme.colors.fg }}>{email}</Text>.
            </Muted>
            {devCode ? <Muted style={{ marginBottom: 12 }}>Dev code: {devCode}</Muted> : null}
            <Input
              label="Login code"
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={8}
              style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
              onSubmitEditing={verify}
            />
            <Button title="Verify and continue" icon="log-in" onPress={verify} loading={busy} size="lg" />
            <Button
              title="Use a different email"
              variant="ghost"
              onPress={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              style={{ marginTop: 12 }}
            />
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
