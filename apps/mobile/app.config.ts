/// <reference types="node" />
import fs from "fs";
import path from "path";
import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * White-label config: one codebase, one store app per brand.
 *   BRAND=sunstone npx expo start
 *   eas build --profile sunstone
 * Brand files live in ./brands/<slug>.json.
 */
export interface BrandConfig {
  slug: string;
  appName: string;
  bundleId: string;
  scheme: string;
  iconColor: string;
  apiUrl: string;
}

function loadBrand(slug: string): BrandConfig {
  const file = path.resolve(__dirname, "brands", `${slug}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Unknown BRAND "${slug}". Add apps/mobile/brands/${slug}.json`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as BrandConfig;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const brand = loadBrand(process.env.BRAND ?? "altaschool");
  // EXPO_PUBLIC_API_URL overrides the brand's API url (e.g. your laptop's LAN IP while developing on a phone).
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? brand.apiUrl;

  return {
    ...config,
    name: brand.appName,
    slug: `elevate-${brand.slug}`,
    scheme: brand.scheme,
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    ios: {
      bundleIdentifier: brand.bundleId,
      supportsTablet: true,
    },
    android: {
      package: brand.bundleId,
      adaptiveIcon: { backgroundColor: brand.iconColor },
    },
    web: { bundler: "metro", output: "single" },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-web-browser",
      [
        "expo-camera",
        {
          cameraPermission: `Allow ${brand.appName} to use the camera to scan event tickets.`,
          recordAudioAndroid: false,
        },
      ],
    ],
    experiments: { typedRoutes: false },
    extra: {
      brand: { ...brand, apiUrl },
    },
  };
};
