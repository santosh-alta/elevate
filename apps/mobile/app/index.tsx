import { Redirect } from "expo-router";
import React from "react";
import { useSession } from "../src/session";
import { Loading, Screen } from "../src/ui";

export default function Index() {
  const { status } = useSession();
  if (status === "loading")
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  return <Redirect href={status === "signedIn" ? "/(tabs)" : "/login"} />;
}
