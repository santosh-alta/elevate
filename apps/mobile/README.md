# Elevate Mobile (Expo, white-label)

One codebase, one store app per brand. Expo SDK 58 + expo-router. **Requires Node ≥ 22.13.**

## Brands
`brands/<slug>.json` → app name, bundle id, scheme, colour, API url. `app.config.ts` picks it with `BRAND`.
At runtime the app calls `GET /v1/tenant` (header `X-Tenant: <slug>`) and applies the brand theme from the API.
Add a brand: copy a JSON file, then add a profile to `eas.json`.

## Run on a phone (Expo Go)
```bash
cd apps/mobile
npm install
# The phone can't reach "localhost": point it at your laptop's LAN IP where the API runs (port 4000)
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 BRAND=sunstone npx expo start
```

`webUrl` in `brands/<slug>.json` (or `EXPO_PUBLIC_WEB_URL`) is the brand's public website; the app uses it for event share links.
Scan the QR code with Expo Go (Android) or the Camera app (iOS). Use `BRAND=altaschool` or `BRAND=mirai` for the
other brands. In Expo Go the app name and icon are Expo Go's; the brand name, bundle id and icon apply in store builds.

## Store builds
```bash
npx eas build --profile sunstone --platform all
npx eas submit --profile sunstone
```

## Screens
| Who | Tabs / screens |
|---|---|
| Everyone | Events (filter by type) → event detail (register/cancel, agenda, speakers) · Tickets (QR) · Certificates (PDF, Add to LinkedIn) · Posts (edit LinkedIn draft, share, mark posted with URL) · Profile |
| Judges (role JUDGE, staff, or anyone with judge assignments) | Judging → teams per round with progress → score screen (submission links, rubric steppers + quick picks, comment, Save draft / Submit with lock) |
| Staff and volunteers | Check-in (QR scanner + manual code) · Event ops (checklist toggle, Drive folder link, add media links) |

All API calls live in `src/api.ts`; response shapes are normalised there, so contract changes touch one file.
