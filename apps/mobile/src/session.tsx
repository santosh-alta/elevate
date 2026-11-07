import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Api,
  CHECKIN_ROLES,
  Membership,
  STAFF_ROLES,
  Tenant,
  User,
  brand,
  setAuthToken,
  setUnauthorizedHandler,
  tokenStore,
} from "./api";
import { BrandTheme, resolveTheme } from "./theme";

type AuthStatus = "loading" | "signedOut" | "signedIn";

interface SessionValue {
  status: AuthStatus;
  tenant: Tenant | null;
  tenantError: string | null;
  theme: BrandTheme;
  user: User | null;
  membership: Membership | null;
  isStaff: boolean;
  isJudge: boolean;
  canCheckin: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  reloadTenant: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [hasJudgeAssignments, setHasJudgeAssignments] = useState(false);

  const reloadTenant = useCallback(async () => {
    try {
      setTenant(await Api.tenant());
      setTenantError(null);
    } catch (e: any) {
      setTenantError(e?.message ?? "Could not load brand");
    }
  }, []);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await tokenStore.clear();
    setUser(null);
    setMembership(null);
    setHasJudgeAssignments(false);
    setStatus("signedOut");
  }, []);

  const loadMe = useCallback(async () => {
    const me = await Api.me();
    setUser(me.user);
    setMembership(me.membership);
    // A STUDENT can still be assigned as a judge on a specific event.
    Api.judgeEvents()
      .then((events) => setHasJudgeAssignments(events.length > 0))
      .catch(() => setHasJudgeAssignments(false));
    setStatus("signedIn");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clearSession());
    reloadTenant();
    (async () => {
      const token = await tokenStore.get();
      if (!token) return setStatus("signedOut");
      setAuthToken(token);
      try {
        await loadMe();
      } catch (e: any) {
        // Keep the token on network errors; drop it on auth errors.
        if (e?.status === 401 || e?.status === 403) await clearSession();
        else setStatus("signedOut");
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [clearSession, loadMe, reloadTenant]);

  const signIn = useCallback(
    async (token: string) => {
      setAuthToken(token);
      await tokenStore.set(token);
      await loadMe();
    },
    [loadMe],
  );

  const value = useMemo<SessionValue>(() => {
    const role = membership?.role;
    const platform = !!user?.isPlatformAdmin;
    const isStaff = platform || (!!role && STAFF_ROLES.includes(role));
    return {
      status,
      tenant,
      tenantError,
      theme: resolveTheme(tenant?.theme, brand.theme ?? { colors: { primary: brand.iconColor } }),
      user,
      membership,
      isStaff,
      isJudge: isStaff || role === "JUDGE" || hasJudgeAssignments,
      canCheckin: platform || (!!role && CHECKIN_ROLES.includes(role)),
      signIn,
      signOut: clearSession,
      refresh: loadMe,
      reloadTenant,
    };
  }, [status, tenant, tenantError, user, membership, hasJudgeAssignments, signIn, clearSession, loadMe, reloadTenant]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

export function useTheme(): BrandTheme {
  return useSession().theme;
}
