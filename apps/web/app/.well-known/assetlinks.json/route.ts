import { getTenant } from "@/lib/tenant";

/**
 * Android App Links: lets the brand's Android app open /events/… and /attend/… links (e.g. the venue check-in QR
 * scanned with the phone camera). ANDROID_CERT_SHA256 = the app-signing certificate fingerprint(s) from Play Console
 * (Setup → App signing), comma-separated. The package comes from the brand settings (androidPackage).
 */
const PACKAGES: Record<string, string> = { altaschool: "tech.altaschool.events" };

export async function GET() {
  const tenant = await getTenant();
  const pkg = (tenant?.settings.androidPackage as string | undefined) ?? (tenant ? PACKAGES[tenant.slug] : undefined);
  const certs = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const body = pkg && certs.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: certs } }]
    : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
