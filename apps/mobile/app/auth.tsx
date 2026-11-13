import { Redirect, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { redeemCode } from "../src/social-login";
import { useSession } from "../src/session";
import { Loading } from "../src/ui";

/**
 * `<scheme>://auth?code=…` — where the website sends the browser after Google/GitHub sign-in. Usually the browser
 * session hands the URL straight to the login screen; on some Android phones it arrives here as a deep link instead.
 */
export default function AuthReturn() {
  const { code } = useLocalSearchParams<{ code?: string; error?: string }>();
  const { signIn } = useSession();
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = code ? await redeemCode(String(code)) : null;
        if (token) await signIn(token);
      } catch {
        // The login screen shows sign-in errors; here we just go back to it.
      } finally {
        if (alive) setDone(true);
      }
    })();
    return () => { alive = false; };
  }, [code, signIn]);

  return done ? <Redirect href="/" /> : <Loading />;
}
