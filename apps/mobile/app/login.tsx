import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Api, brand, WEB_BASE } from "../src/api";
import { useSession } from "../src/session";
import { signInWith, type SocialProvider } from "../src/social-login";
import { withAlpha } from "../src/theme";
import { ErrorBanner } from "../src/ui";

WebBrowser.maybeCompleteAuthSession();

/** Brand assets like "/brands/x/logo.png" live on the website. */
const webAsset = (url?: string) => (!url ? undefined : /^https?:\/\//.test(url) ? url : WEB_BASE ? `${WEB_BASE}${url}` : undefined);

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

export default function Login() {
  const { status, user, tenant, tenantError, theme, signIn, reloadTenant } = useSession();
  const [providers, setProviders] = useState<{ google: string | null; github: string | null } | null>(null);
  const [step, setStep] = useState<"start" | "code">("start");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState<null | "email" | "code" | SocialProvider>(null);
  const [error, setError] = useState<string | null>(null);
  const codeInput = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    Api.authProviders().then(setProviders).catch(() => setProviders({ google: null, github: null }));
  }, []);

  if (status === "signedIn") {
    // First sign-in: ask for the few details organisers need (name, phone, college) before anything else.
    return <Redirect href={user && !user.profileCompletedAt ? "/profile-edit?first=1" : "/(tabs)"} />;
  }

  const brandName = tenant?.name ?? brand.appName;
  const logo = webAsset(theme.logoDarkUrl ?? theme.logoUrl);
  const c = theme.colors;
  const radius = theme.radius ?? 12;

  async function social(p: SocialProvider) {
    setBusy(p);
    setError(null);
    try {
      const token = await signInWith(p);
      if (token) await signIn(token);
    } catch (e: any) {
      setError(e?.message ?? "Sign-in didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function requestCode() {
    const value = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(value)) return setError("Enter a valid email address.");
    setBusy("email");
    setError(null);
    try {
      const res = await Api.requestOtp(value);
      setEmail(value);
      setDevCode(res.devCode);
      setStep("code");
      setTimeout(() => codeInput.current?.focus(), 250);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function verify(value = code) {
    if (value.trim().length < 6) return setError("Enter the 6-digit code from your email.");
    setBusy("code");
    setError(null);
    try {
      const res = await Api.verifyOtp(email, value.trim());
      await signIn(res.token);
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  }

  const socialButton = (p: SocialProvider) => {
    const google = p === "google";
    return (
      <Pressable
        key={p}
        onPress={() => social(p)}
        disabled={!!busy}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, height: 54, borderRadius: radius,
          backgroundColor: google ? "#ffffff" : "#24292f", borderWidth: 1, borderColor: google ? c.border : "#24292f",
          opacity: busy && busy !== p ? 0.5 : pressed ? 0.85 : 1,
          shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
        })}
      >
        {busy === p ? <ActivityIndicator color={google ? "#1f1f1f" : "#fff"} /> : google ? <GoogleG /> : <Ionicons name="logo-github" size={22} color="#fff" />}
        <Text style={{ fontSize: 16, fontWeight: "700", color: google ? "#1f1f1f" : "#ffffff" }}>Continue with {google ? "Google" : "GitHub"}</Text>
      </Pressable>
    );
  };

  const hasSocial = !!(providers?.google || providers?.github);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
          {/* Brand header */}
          <View style={{ backgroundColor: c.heroBg, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden" }}>
            <View pointerEvents="none" style={{ position: "absolute", right: -60, top: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: withAlpha(theme.gradient?.[0] ?? c.accent, 0.35) }} />
            <View pointerEvents="none" style={{ position: "absolute", left: -50, bottom: -70, width: 200, height: 200, borderRadius: 100, backgroundColor: withAlpha(theme.gradient?.[1] ?? c.secondary, 0.25) }} />
            <SafeAreaView edges={["top"]}>
              <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 36 }}>
                {logo ? (
                  <Image source={{ uri: logo }} style={{ width: 150, height: 48 }} resizeMode="contain" accessibilityLabel={brandName} />
                ) : (
                  <Text style={{ color: c.heroFg, fontWeight: "800", fontSize: 18, letterSpacing: 1 }}>{brandName.toUpperCase()}</Text>
                )}
                <Text style={{ color: c.heroFg, fontSize: 32, fontWeight: "800", letterSpacing: -0.6, marginTop: 28, lineHeight: 38 }}>
                  {step === "code" ? "Check your email" : "Welcome 👋"}
                </Text>
                <Text style={{ color: withAlpha(c.heroFg, 0.82), fontSize: 16, lineHeight: 23, marginTop: 8 }}>
                  {step === "code"
                    ? "Enter the 6-digit code we just sent you."
                    : `Sign in to ${brandName} to register for events, get your QR tickets and collect certificates.`}
                </Text>
                {step === "start" ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
                    {([["flash", "Register in a tap"], ["qr-code", "QR tickets"], ["ribbon", "Certificates"]] as const).map(([icon, label]) => (
                      <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: withAlpha(c.heroFg, 0.1) }}>
                        <Ionicons name={icon} size={13} color={c.accent} />
                        <Text style={{ color: withAlpha(c.heroFg, 0.9), fontSize: 12, fontWeight: "600" }}>{label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </SafeAreaView>
          </View>

          {/* Sign-in options */}
          <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
            <View style={{ padding: 24, gap: 14, flex: 1 }}>
              {tenantError ? <ErrorBanner message={tenantError} onRetry={reloadTenant} /> : null}
              {error ? <ErrorBanner message={error} /> : null}

              {step === "start" ? (
                <>
                  {providers === null ? <ActivityIndicator color={c.accent} style={{ marginVertical: 8 }} /> : null}
                  {providers?.google ? socialButton("google") : null}
                  {providers?.github ? socialButton("github") : null}
                  {hasSocial ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
                      <Text style={{ color: c.muted, fontSize: 13 }}>or use your email</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
                    </View>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, height: 54, borderWidth: 1, borderColor: c.border, borderRadius: radius, backgroundColor: c.card, paddingHorizontal: 14 }}>
                    <Ionicons name="mail-outline" size={20} color={c.muted} />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@college.edu"
                      placeholderTextColor={c.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      keyboardType="email-address"
                      returnKeyType="send"
                      onSubmitEditing={requestCode}
                      style={{ flex: 1, fontSize: 16, color: c.fg }}
                      accessibilityLabel="Email"
                    />
                  </View>
                  <Pressable
                    onPress={requestCode}
                    disabled={!!busy}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ height: 54, borderRadius: radius, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: busy && busy !== "email" ? 0.5 : pressed ? 0.85 : 1 })}
                  >
                    {busy === "email" ? <ActivityIndicator color={c.primaryFg} /> : <>
                      <Text style={{ color: c.primaryFg, fontSize: 16, fontWeight: "700" }}>Email me a sign-in code</Text>
                      <Ionicons name="arrow-forward" size={18} color={c.primaryFg} />
                    </>}
                  </Pressable>
                  <Text style={{ color: c.muted, fontSize: 13, textAlign: "center", lineHeight: 19 }}>No password needed. New here? Your account is created when you sign in.</Text>
                </>
              ) : (
                <>
                  <Text style={{ color: c.fg, fontSize: 15 }}>
                    Sent to <Text style={{ fontWeight: "700" }}>{email}</Text>
                  </Text>
                  {devCode ? <Text style={{ color: c.muted }}>Dev code: {devCode}</Text> : null}
                  <TextInput
                    ref={codeInput}
                    value={code}
                    onChangeText={(t) => {
                      const digits = t.replace(/\D/g, "").slice(0, 6);
                      setCode(digits);
                      if (digits.length === 6) verify(digits);
                    }}
                    placeholder="••••••"
                    placeholderTextColor={c.muted}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    accessibilityLabel="Sign-in code"
                    style={{ height: 64, borderWidth: 1.5, borderColor: code.length === 6 ? c.accent : c.border, borderRadius: radius, backgroundColor: c.card, fontSize: 28, letterSpacing: 12, textAlign: "center", color: c.fg, fontWeight: "700" }}
                  />
                  <Pressable
                    onPress={() => verify()}
                    disabled={!!busy}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ height: 54, borderRadius: radius, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1 })}
                  >
                    {busy === "code" ? <ActivityIndicator color={c.primaryFg} /> : <Text style={{ color: c.primaryFg, fontSize: 16, fontWeight: "700" }}>Verify and continue</Text>}
                  </Pressable>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Pressable hitSlop={10} onPress={() => { setStep("start"); setCode(""); setError(null); }}>
                      <Text style={{ color: c.accent, fontWeight: "600" }}>Change email</Text>
                    </Pressable>
                    <Pressable hitSlop={10} disabled={!!busy} onPress={requestCode}>
                      <Text style={{ color: c.accent, fontWeight: "600" }}>Resend code</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <View style={{ flex: 1 }} />
              {WEB_BASE ? (
                <Text style={{ color: c.muted, fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 12 }}>
                  By continuing you agree to our{" "}
                  <Text style={{ color: c.accent, fontWeight: "600" }} onPress={() => WebBrowser.openBrowserAsync(`${WEB_BASE}/privacy`)}>Privacy policy</Text>.
                </Text>
              ) : null}
            </View>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
