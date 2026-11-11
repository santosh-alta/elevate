import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Alert, Text, View } from "react-native";
import { brand } from "../../src/api";
import { useSession } from "../../src/session";
import { withAlpha } from "../../src/theme";
import { Body, Button, Card, Muted, Row, Screen, SectionHeader, Title, humanize } from "../../src/ui";

export default function ProfileScreen() {
  const { theme, user, membership, tenant, isStaff, canCheckin, signOut } = useSession();
  const initials = (user?.name ?? "?")
    .split(" ")
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Screen>
      <Title>Profile</Title>
      <Card style={{ alignItems: "center", gap: 6, paddingVertical: 24 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: withAlpha(theme.colors.primary, 0.15),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 28, fontWeight: "800", color: theme.colors.primary }}>{initials}</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: "700", color: theme.colors.fg, marginTop: 8 }}>{user?.name}</Text>
        <Muted>{user?.email}</Muted>
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

      <View style={{ marginTop: 32 }}>
        <Button
          title="Log out"
          icon="log-out-outline"
          variant="ghost"
          onPress={() =>
            Alert.alert("Log out?", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Log out", style: "destructive", onPress: () => signOut() },
            ])
          }
        />
      </View>
    </Screen>
  );
}
