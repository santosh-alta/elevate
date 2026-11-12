import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { useSession } from "../src/session";
import { Loading, Screen } from "../src/ui";
import { WELCOME_KEY } from "./welcome";

export default function Index() {
  const { status } = useSession();
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => { SecureStore.getItemAsync(WELCOME_KEY).then((v) => setSeen(!!v)).catch(() => setSeen(true)); }, []);
  if (status === "loading" || seen === null)
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  if (status === "signedIn") return <Redirect href="/(tabs)" />;
  return <Redirect href={seen ? "/login" : "/welcome"} />;
}
