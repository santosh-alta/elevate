import { getTenant } from "@/lib/tenant";

/**
 * Android App Links: lets the brand's Android app open /events/… and /attend/… links (e.g. the venue check-in QR
 * scanned with the phone camera). ANDROID_CERT_SHA256 = the app-signing certificate fingerprint(s) from Play Console
 * (Setup → App signing), comma-separated. The package comes from the brand settings (androidPackage).
 */
const PACKAGES: Record<string, string> = { altaschool: "tech.altaschool.events" };
/** Play app-signing certificates (public; Play Console → Test and release → App integrity → App signing). */
const CERTS: Record<string, string[]> = {
  altaschool: ["A4:60:37:AE:2D:DB:43:97:A4:33:CA:A0:94:B6:32:59:97:45:17:80:01:C7:9A:D4:51:4B:28:FD:05:90:B1:BA"],
};

export async function GET() {
  const tenant = await getTenant();
  const pkg = (tenant?.settings.androidPackage as string | undefined) ?? (tenant ? PACKAGES[tenant.slug] : undefined);
  const fromEnv = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const certs = [...new Set([...(tenant ? CERTS[tenant.slug] ?? [] : []), ...fromEnv])];
  const body = pkg && certs.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: certs } }]
    : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
