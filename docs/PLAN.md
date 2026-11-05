# Elevate — Event Operations Platform

**Elevate** is one platform used by all of our brands (Alta School of Technology, Sunstone, Mirai, and any brand added later).
Each brand gets its own **white-label** web app and mobile app, on its own domain, with its own theme.
All data lives in **one shared database**, separated by brand (`tenantId`).

```
event.altaschool.tech ─┐
event.sunstone.in      ├──►  Elevate Web (Next.js)  ──►  Elevate API (Fastify)  ──►  PostgreSQL (one DB)
event.mirai.xx         ┘     resolves brand from host        tenant-scoped             every row has tenantId
Alta Events (iOS/Android) ─┐
Sunstone Events (iOS/And.) ├─► Elevate Mobile (Expo) — one codebase, one store build per brand
```

---

## 1. Goals

1. **Create any event** (hackathon, seminar, workshop, guest lecture, competition, bootcamp, cultural, webinar), at
   **central level or at a campus**, **online, offline or hybrid**.
2. **Track the whole lifecycle digitally**: planning, announcement, registration, the event itself, judging, and
   post-event work (photos, social posts, certificates, LinkedIn posts, the outcome report).
3. **Automate the repetitive work**: checklists, reminders, QR tickets, certificates, LinkedIn post drafts, reports.
4. **Give admins one dashboard per event and per brand** showing what happened, who came, what the outcome was, and
   what is still pending.
5. **White-label**: each brand's site and app look like its own product (domain, logo, colours, fonts, app name, store
   listing).

## 2. Users and roles

| Role | Scope | What they do |
|---|---|---|
| `PLATFORM_ADMIN` | Elevate (all brands) | Create brands, attach domains, view all brands |
| `BRAND_ADMIN` | One brand | Campuses, team members, brand theme, all events of the brand |
| `CAMPUS_ADMIN` | One campus | Events at their campus |
| `EVENT_MANAGER` | Assigned events | Plan and run events, tasks, guests, media |
| `JUDGE` | Assigned events | Score teams on the mobile app |
| `VOLUNTEER` | Assigned events | QR check-in, task updates, photo uploads |
| `SPEAKER` / guest | One event | Accept invite, upload photo and bio |
| `STUDENT` / participant | Brand | Register, join or create a team, submit project, get certificate and LinkedIn post |

A person has one account (`User`) and a `Membership` per brand, which holds the role and an optional campus.
The same person can be a student on Sunstone and a judge on Alta.

## 3. Event model

### 3.1 Event core
- **Type**: `HACKATHON | SEMINAR | WORKSHOP | GUEST_LECTURE | COMPETITION | BOOTCAMP | WEBINAR | CULTURAL | OTHER`
- **Scope**: `CENTRAL` (whole brand) or `CAMPUS` (one or more campuses)
- **Mode**: `ONLINE | OFFLINE | HYBRID`, with a venue (campus + room/address) and/or a meeting link
- **Schedule**: start/end, registration open/close, agenda sessions
- **Capacity**, eligibility (which campuses/batches), and whether registration needs approval
- **Feature modules** that can be switched on per event (defaults depend on the type):
  `teams`, `judging`, `submissions`, `guests`, `checkin`, `certificates`, `feedback`, `budget`

### 3.2 Lifecycle (status)
```
DRAFT → PLANNING → ANNOUNCED → REGISTRATION_OPEN → REGISTRATION_CLOSED → LIVE → JUDGING → COMPLETED → ARCHIVED
                                                                                        ↘ CANCELLED (from any)
```
Every status change, task update, upload and score lock is written to an **activity timeline** (`EventActivity`), so
an admin can see exactly what happened and who did it.

### 3.3 Planning checklist (auto-generated)
When an event is created, Elevate creates a checklist from a **template for that event type**, grouped by phase
(`PRE`, `DURING`, `POST`). Each task has an owner, a due date relative to the event date, and a status. Examples:

**Seminar / guest lecture**
- PRE: confirm topic and date · invite guest · collect guest photo, bio and designation · design poster · book venue
  and AV · announce on brand channels · arrange guest travel/stay · prepare memento
- DURING: guest welcome · photographer assigned · QR attendance · live social stories
- POST: upload photos (Drive link) · share thank-you note to guest · social media posts · certificates ·
  LinkedIn post suggestions sent · feedback form · outcome report

**Hackathon**
- PRE: problem statements · rules and judging rubric · prizes · judges invited · mentors · registration form ·
  announcement · team formation closes · venue, Wi-Fi, food
- DURING: check-in · kickoff · mentor rounds · submission deadline · judging rounds · results announced
- POST: winner certificates · participation certificates · photos · social posts · LinkedIn posts · report

Templates are editable per brand.

### 3.4 Hackathon specifics
- **Teams**: min/max team size, create a team and invite by code, team leader, team approval
- **Problem statements / tracks**, each team picks one
- **Submissions**: repo link, demo link, deck, video
- **Judging**:
  - Admin defines a **rubric** (criteria, max score, weight), e.g. Innovation 10 (×1.5), Execution 10, Presentation 10
  - Admin adds **judges** (existing users or invite by email) and assigns them to all teams or to specific teams/tracks
  - Multiple **rounds** (e.g. Round 1 screening, Finals)
  - Judges score on the **mobile app**: list of assigned teams → team detail and submission → score each criterion
    with a slider and add a comment → save draft → **submit** (locks the score)
  - **Live leaderboard** with weighted average across judges; admin publishes results
  - Winners (1st/2nd/3rd, special mentions) feed directly into certificates

### 3.5 Guests and speakers
Invite status (`INVITED → CONFIRMED → ARRIVED → THANKED`), photo, bio, designation, organisation, LinkedIn, travel
notes, honorarium and memento. The guest photo and bio feed the poster, the announcement, and the speaker certificate.

### 3.6 Registration and attendance
- Public event page on the brand domain → register (with custom form questions) → **QR ticket** by email and in the app
- Volunteers **scan QR codes** in the mobile app for check-in; online events track joins via the link
- Status: `REGISTERED → APPROVED → CHECKED_IN` (or `WAITLISTED`, `CANCELLED`, `NO_SHOW`)

### 3.7 Media and social
- **Drive folder link** per event (the photographer drops all photos there) plus direct uploads for key photos
- Media items: `PHOTO_ALBUM | PHOTO | VIDEO | POSTER | GUEST_PHOTO | DECK | OTHER`
- **Social post tracker**: for each platform (LinkedIn, Instagram, X, YouTube, Facebook) the post's status
  (`PLANNED → DRAFTED → POSTED`), link, owner, and reach metrics that can be filled in later
- The social media team gets a "ready for social" queue: events where the Drive link is uploaded but posts are not done

### 3.8 Certificates (automatic)
- A certificate template per brand, with a design per certificate type:
  `PARTICIPATION | WINNER | RUNNER_UP | JUDGE | SPEAKER | VOLUNTEER | MENTOR`
- When an event is marked COMPLETED, certificates are **generated automatically**:
  participation for everyone checked in, winner/runner-up from the published results, and certificates for
  judges, speakers and volunteers
- Each certificate has a unique serial and a **public verification page** (`/verify/ABC123`) on the brand domain
- Students download the PDF and can **"Add to LinkedIn profile"** (LinkedIn's certification add-to-profile URL)

### 3.9 LinkedIn post suggestions (automatic)
For every participant, Elevate drafts a personalised LinkedIn post (event name, their role/team/result, what they
learned, the brand's hashtags, and the certificate link). It uses an AI model (Claude) with a template as fallback.
The student sees the post in the app, can edit it, and taps **Share on LinkedIn**. They can then paste their post URL
back, which is how we **track who posted**.

### 3.10 Feedback and outcome report
- Feedback form after the event (rating, NPS, comments), sent automatically
- **Outcome report**, generated per event: registrations, attendance, campus split, teams, winners, feedback score,
  photos link, social posts done, certificates issued, LinkedIn posts done, budget vs. actual, and highlights.
  It can be exported as PDF.

### 3.11 Budget (optional module)
Planned budget lines and actual expenses with receipts, per event.

## 4. Admin dashboards
- **Brand dashboard**: upcoming, live and completed events; registrations this month; attendance rate; certificates
  issued; LinkedIn posts done; events with overdue tasks; filters by campus, type and date
- **Event command centre** (one page per event): status stepper, checklist progress, registrations/attendance
  counters, teams and judging progress, guests, media, social posts, certificates, LinkedIn tracking, activity timeline
- **Platform dashboard** (Elevate team): all brands side by side

## 5. White-label design

| Piece | How it works |
|---|---|
| **Brand resolution (web)** | Next.js middleware reads the `Host` header → `TenantDomain` lookup (cached) → brand id and theme |
| **Custom domains** | Brand admin adds `event.sunstone.in` → Elevate shows a CNAME target and a TXT verification record → after verification the domain is added to the hosting provider (Vercel Domains API or Caddy on-demand TLS) → automatic SSL |
| **Default domain** | `<brand>.elevate.app`-style subdomain until a custom domain is attached |
| **Theme** | `Tenant.theme` JSON: colours, logo, favicon, font, border radius, email header. Rendered as CSS variables, so a single codebase serves every look |
| **Mobile** | One Expo codebase. `BRAND=sunstone eas build` picks the app name, bundle id, icon, splash and API tenant from `apps/mobile/brands/<brand>.json` → a separate store listing per brand. The theme is also loaded at runtime from the API, so colour changes don't need a new build |
| **Emails / certificates** | Brand logo, colours, sender name and domain per brand |
| **Data isolation** | Every table has `tenantId`; the API derives the tenant from the domain or app and the user's membership and scopes every query. Postgres Row-Level Security will be added as a second safety layer |

## 6. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Database | **PostgreSQL 16** | As requested; JSONB for flexible theme/forms/module config |
| ORM | **Prisma** | Typed schema and migrations |
| API | **Node.js + Fastify + TypeScript + Zod** | Fast, simple, typed end to end |
| Jobs / automation | **pg-boss** (queue in Postgres) | No extra infrastructure; used for certificates, emails, reminders, reports |
| Auth | Email OTP + JWT (Google sign-in later) | Students don't need passwords |
| Files | S3-compatible storage (Cloudflare R2 / AWS S3) + Google Drive links | Photos, certificates, posters |
| PDF / QR | `pdf-lib`, `qrcode` | Certificates and tickets |
| AI | Claude API | LinkedIn post drafts, event report summaries |
| Web | **Next.js 15 (App Router) + Tailwind** | Multi-domain support, SEO for public event pages |
| Mobile | **Expo (React Native) + expo-router** | iOS and Android from one codebase; white-label builds with EAS |
| Shared | `packages/shared` | Enums, Zod schemas and types used by the API, web and mobile |
| Hosting (suggested) | API + DB on Render/Railway/AWS (RDS); web on Vercel (custom domains API); mobile through EAS | |

## 7. Repository layout
```
elevate/
├── apps/
│   ├── api/        Fastify + Prisma (schema in apps/api/prisma/schema.prisma)
│   ├── web/        Next.js white-label web app (public pages + admin)
│   └── mobile/     Expo app (students, judges, volunteers)
├── packages/
│   └── shared/     enums, zod schemas, checklist templates
├── docs/           this plan, API notes
└── docker-compose.yml   local Postgres
```

## 8. Roadmap

| Phase | Scope |
|---|---|
| **1 — Foundation** (this repo) | Brands, domains, themes, campuses, users and roles, events CRUD, lifecycle, checklists, registration, QR, teams, judging, media and social tracker, certificates, LinkedIn drafts, dashboards |
| **2 — Ops polish** | Email/WhatsApp notifications, reminders, feedback forms, budget, PDF outcome report, custom registration forms |
| **3 — Mobile release** | Store builds per brand, push notifications, offline QR check-in, judge offline scoring with sync |
| **4 — Scale** | Postgres RLS, Google sign-in / SSO, LinkedIn API for post metrics, analytics warehouse, public event discovery across brands |

## 9. Open questions
1. Brand list and domains: Alta School of Technology (`altaschool.tech`), Sunstone (`sunstone.in`), Mirai (domain?),
   plus any other brands (spelling needed).
2. Campus list per brand.
3. Login: email OTP only, or also Google Workspace for staff?
4. Hosting preference (AWS vs. Render/Railway/Vercel).
5. One app per brand in the stores (true white-label) or a single "Elevate" app that switches brand? This plan assumes
   one app per brand.
