import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Api, brand, WEB_BASE } from "./api";

/**
 * Google / GitHub sign-in for the app. It runs the website's normal sign-in in the phone's browser (Google doesn't
 * allow sign-in inside an app's own web view), then the website sends the browser back to `<scheme>://auth?code=…`.
 *
 * The app proves the code is meant for it: before starting it makes a random secret, sends only its SHA-256
 * (the "challenge"), and later redeems the code together with the secret. A code seen by anything else is useless.
 */
export type SocialProvider = "google" | "github";

export const RETURN_URL = `${brand.scheme}://auth`;

// The secret for the sign-in in progress. Kept in memory only; the auth route reads it too if Android delivers the
// redirect as a deep link instead of to the browser session.
let pending: { verifier: string } | null = null;
const redeemed = new Set<string>();

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const ERRORS: Record<string, string> = {
  "google-off": "Google sign-in isn't available right now. Please use your email instead.",
  "github-off": "GitHub sign-in isn't available right now. Please use your email instead.",
  "login-cancelled": "Sign-in was cancelled.",
  "login-expired": "That sign-in took too long. Please try again.",
};

/** Swaps a handoff code for a session token. Safe to call twice for the same code (the second call returns null). */
export async function redeemCode(code: string): Promise<string | null> {
  if (!pending || redeemed.has(code)) return null;
  redeemed.add(code);
  const { verifier } = pending;
  pending = null;
  const res = await Api.redeemSignIn(code, verifier);
  return res.token;
}

/** Reads `?code=` / `?error=` from the URL the website sent back. Throws a readable message on failure. */
export async function handleReturnUrl(url: string): Promise<string | null> {
  const query = url.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const error = params.get("error");
  if (error) {
    pending = null;
    throw new Error(params.get("message") || ERRORS[error] || "Sign-in didn't work. Please try again, or use your email.");
  }
  const code = params.get("code");
  return code ? redeemCode(code) : null;
}

/** Opens the browser for Google or GitHub. Resolves to a session token, or null if the person closed the browser. */
export async function signInWith(provider: SocialProvider): Promise<string | null> {
  if (!WEB_BASE) throw new Error("Sign-in with Google or GitHub isn't available in this app.");
  const verifier = hex(Crypto.getRandomBytes(32));
  const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.HEX });
  pending = { verifier };
  const start = `${WEB_BASE}/api/auth/${provider}/start?app=${challenge}&return=${encodeURIComponent(RETURN_URL)}`;
  const result = await WebBrowser.openAuthSessionAsync(start, RETURN_URL, { showInRecents: true });
  if (result.type !== "success") return null; // closed or dismissed; the deep-link route may still finish it
  return handleReturnUrl(result.url);
}
