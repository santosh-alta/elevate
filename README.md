# Elevate

One event operations platform for all our brands (Alta School of Technology, Sunstone, Mirai, …), with a white-label
web app and mobile app per brand.

Plan and product design: [docs/PLAN.md](docs/PLAN.md) · API contract: [docs/API.md](docs/API.md)

| App | Path | Stack |
|---|---|---|
| API | `apps/api` | Node.js, Fastify, Prisma, PostgreSQL |
| Web (public site and admin) | `apps/web` | Next.js 15, Tailwind |
| Mobile (students, judges, volunteers) | `apps/mobile` | Expo / React Native |
| Shared types and templates | `packages/shared` | TypeScript, Zod |

## Run locally

Requirements: Node 20+ and PostgreSQL 16 (Docker, Postgres.app or Homebrew).

```bash
npm install                      # API + web + shared
npm run db:up                    # starts Postgres in Docker (or use your own and edit apps/api/.env)
cp apps/api/.env.example apps/api/.env
npm run db:migrate               # create the tables
npm run db:seed                  # demo brands, campuses, events, users
npm run dev:api                  # http://localhost:4000
npm run dev:web                  # http://localhost:3000
```

Open each brand locally through `*.localhost` subdomains (no hosts-file changes needed in modern browsers):

- http://altaschool.localhost:3000
- http://sunstone.localhost:3000
- http://mirai.localhost:3000

Log in with any seeded email (for example `admin@elevate.dev`). In development the one-time code appears in the
API log and in the login response.

### Mobile
```bash
cd apps/mobile && npm install
BRAND=sunstone npx expo start     # scan the QR code with Expo Go
```
On a phone, set the brand's `apiUrl` in `apps/mobile/brands/<brand>.json` to your computer's LAN IP.

## Adding a new brand
1. Create the brand (platform admin), or add it to `apps/api/prisma/seed.ts`.
2. In **Admin → Settings**, set the theme (logo, colours, font) and add the custom domain, for example
   `event.newbrand.com`.
3. In the brand's DNS, add the CNAME and TXT records shown on that screen, then press **Verify**.
4. For the mobile app, add `apps/mobile/brands/<slug>.json` and an EAS build profile.
