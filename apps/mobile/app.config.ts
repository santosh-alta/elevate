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
  /** Public website for this brand (event pages, share links). */
  webUrl?: string;
  /** Built-in theme (same shape as the tenant theme) used before /v1/tenant loads. */
  theme?: { colors?: Record<string, string>; [k: string]: unknown };
  /** App icon / splash files, relative to apps/mobile. Defaults to assets/brands/<slug>/{icon,adaptive-icon,splash-icon|splash}.png when present. */
  assets?: { icon?: string; adaptiveIcon?: string; splash?: string };
  /** Splash background; defaults to theme.colors.heroBg, then iconColor. */
  splashColor?: string;
}

/** Brand asset path if the file exists (explicit JSON path first, then the assets/brands/<slug>/ convention). */
function brandAsset(brand: BrandConfig, key: keyof NonNullable<BrandConfig["assets"]>, file: string): string | undefined {
  const candidates = [brand.assets?.[key], `./assets/brands/${brand.slug}/${file}`].filter((p): p is string => !!p);
  return candidates.find((p) => fs.existsSync(path.resolve(__dirname, p)));
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
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? brand.webUrl;
  const icon = brandAsset(brand, "icon", "icon.png");
  const adaptiveIcon = brandAsset(brand, "adaptiveIcon", "adaptive-icon.png");
  // Prefer a tightly cropped logo (splash-icon.png): Android 12+ shows the splash image as a centred icon.
  const splashIcon = brandAsset(brand, "splash", "splash-icon.png");
  const splash = splashIcon ?? brandAsset(brand, "splash", "splash.png");
  const splashColor = brand.splashColor ?? brand.theme?.colors?.heroBg ?? brand.iconColor;

  return {
    ...config,
    name: brand.appName,
    slug: `elevate-${brand.slug}`,
    scheme: brand.scheme,
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    ...(icon && { icon }),
    ios: {
      bundleIdentifier: brand.bundleId,
      supportsTablet: true,
    },
    android: {
      package: brand.bundleId,
      adaptiveIcon: { backgroundColor: brand.iconColor, ...(adaptiveIcon && { foregroundImage: adaptiveIcon }) },
    },
    web: { bundler: "metro", output: "single" },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-web-browser",
      [
        "expo-splash-screen",
        {
          backgroundColor: splashColor,
          ...(splash && { image: splash, imageWidth: splashIcon ? 240 : 200, resizeMode: "contain" }),
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission: `Allow ${brand.appName} to use the camera to scan event tickets.`,
          recordAudioAndroid: false,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: `Allow ${brand.appName} to pick event photos from your library.`,
          cameraPermission: `Allow ${brand.appName} to take event photos.`,
        },
      ],
    ],
    experiments: { typedRoutes: false },
    extra: {
      brand: { ...brand, apiUrl, webUrl },
    },
  };
};
