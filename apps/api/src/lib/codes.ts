import { createHash, randomBytes, randomInt } from "node:crypto";

// Unambiguous characters for human-typed codes (no 0/O, 1/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function secureCode(len = 8): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Short brand prefix for printed codes, from the brand's name: "ALTA School of Technology" → "ALTA". */
export function brandCode(name: string | null | undefined, fallback = "CERT"): string {
  const first = (name ?? "").trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  return first.slice(0, 6) || fallback;
}

/** e.g. "ALTA-7KQ2-M9XP" (the brand's prefix, so no platform name appears on certificates) */
export function certificateSerial(prefix = "CERT"): string {
  return `${prefix}-${secureCode(4)}-${secureCode(4)}`;
}

export function teamInviteCode(): string {
  return secureCode(6);
}

/** Unguessable token for links (guest portal, draft preview). */
export function urlToken(): string {
  return randomBytes(24).toString("base64url");
}

export function otpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}
