/** Social sign-in providers. Client ids come from the API (GET /auth/providers); secrets stay on the API. */
export const PROVIDERS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    params: { response_type: "code", scope: "openid email profile", prompt: "select_account" } as Record<string, string>,
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    params: { scope: "read:user user:email", allow_signup: "true" } as Record<string, string>,
  },
} as const;
export type Provider = keyof typeof PROVIDERS;
export const isProvider = (p: string): p is Provider => p in PROVIDERS;
export const STATE_COOKIE = "elevate_oauth_state";

/** Mobile app sign-in: the app's SHA-256 challenge, and where to send the browser back (the app's own scheme). */
export const appChallenge = (v: string | null) => (v && /^[a-f0-9]{64}$/.test(v) ? v : null);
export const appReturn = (v: string | null) =>
  v && /^[a-z][a-z0-9+.-]{1,40}:\/\/auth$/.test(v) && !/^(https?|javascript|data|file|intent):/.test(v) ? v : null;
