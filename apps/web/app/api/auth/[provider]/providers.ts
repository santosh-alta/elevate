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
