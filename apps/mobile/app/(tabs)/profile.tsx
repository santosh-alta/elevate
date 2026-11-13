import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Alert, Text, View } from "react-native";
import { Api, WEB_BASE, brand } from "../../src/api";
import { unregisterPush } from "../../src/push";
import { Avatar } from "../../src/avatar";
import { useSession } from "../../src/session";
import { withAlpha } from "../../src/theme";
import { Body, Button, Card, Muted, Row, Screen, SectionHeader, Title, humanize } from "../../src/ui";

export default function ProfileScreen() {
  const { theme, user, membership, tenant, isStaff, canCheckin, signOut } = useSession();

  return (
    <Screen>
      <Title>Profile</Title>
      <Card style={{ alignItems: "center", gap: 6, paddingVertical: 24 }}>
        <Avatar name={user?.name} url={user?.avatarUrl} size={88} />
        <Text style={{ fontSize: 20, fontWeight: "700", color: theme.colors.fg, marginTop: 8 }}>{user?.name}</Text>
        <Muted>{user?.email}</Muted>
        <Button title="Edit profile" icon="create-outline" variant="secondary" size="sm" onPress={() => router.push("/profile-edit")} style={{ marginTop: 10, alignSelf: "stretch" }} />
      </Card>

      <SectionHeader>More</SectionHeader>
      <Card style={{ gap: 10 }}>
        <Button title="Event calendar" icon="calendar-outline" variant="ghost" onPress={() => router.push("/calendar")} />
        <Button title="Campuses" icon="business-outline" variant="ghost" onPress={() => router.push("/campuses")} />
        <Button title="Mark my attendance (scan venue QR)" icon="scan-outline" variant="ghost" onPress={() => router.push("/attend")} />
        <Button title="Ask the assistant" icon="sparkles-outline" variant="ghost" onPress={() => router.push("/assistant")} />
        <Button title="Notifications" icon="notifications-outline" variant="ghost" onPress={() => router.push("/notifications")} />
      </Card>

      <SectionHeader>Membership</SectionHeader>
      <Card style={{ gap: 10 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Muted>Brand</Muted>
          <Body>{tenant?.name ?? brand.appName}</Body>
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Muted>Role</Muted>
          <Body>{user?.isPlatformAdmin ? "Platform admin" : humanize(membership?.role ?? "STUDENT")}</Body>
        </Row>
        {membership?.campus ? (
          <Row style={{ justifyContent: "space-between" }}>
            <Muted>Campus</Muted>
            <Body>{membership.campus.name}</Body>
          </Row>
        ) : null}
      </Card>

      {isStaff || canCheckin ? (
        <>
          <SectionHeader>Staff tools</SectionHeader>
          <Button title="Event ops (tasks & media)" icon="construct" variant="secondary" onPress={() => router.push("/ops")} />
        </>
      ) : null}

      <View style={{ marginTop: 32, gap: 10 }}>
        <Button
          title="Log out"
          icon="log-out-outline"
          variant="ghost"
          onPress={() =>
            Alert.alert("Log out?", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Log out", style: "destructive", onPress: async () => { await unregisterPush(); await signOut(); } },
            ])
          }
        />
        {WEB_BASE ? <Button title="Privacy policy" icon="shield-checkmark-outline" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(`${WEB_BASE}/privacy`)} /> : null}
        <Button
          title="Delete account"
          icon="trash-outline"
          variant="ghost"
          onPress={() =>
            Alert.alert(
              "Delete your account?",
              "Your name, email, phone, profile links and sign-in are erased and you'll be signed out. Past participation stays only as anonymous numbers. This can't be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await unregisterPush();
                      await Api.deleteAccount();
                      await signOut();
                    } catch (e: any) {
                      Alert.alert("Couldn't delete", e?.message ?? "Please try again.");
                    }
                  },
                },
              ],
            )
          }
        />
        <Muted style={{ textAlign: "center", fontSize: 12 }}>{brand.appName} · version {Constants.expoConfig?.version ?? ""}</Muted>
      </View>
    </Screen>
  );
}
