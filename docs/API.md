# Elevate API contract (v1)

Base URL: `${API_URL}/v1`. All bodies are JSON.

## Tenant resolution
Every request carries the brand in one of these (checked in order):
1. `X-Tenant: <slug>` header (mobile apps, server-side web calls)
2. `X-Forwarded-Host` / `Host` matched against `TenantDomain.hostname`

## Auth
`Authorization: Bearer <jwt>`. The JWT payload is `{ sub: userId }`. The role comes from the user's `Membership` in
the resolved tenant (`isPlatformAdmin` users have every permission).
In development (`NODE_ENV !== "production"`), the OTP is returned in the response and logged.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tenant` | – | Current brand: `{ id, slug, name, theme, settings, campuses[] }` |
| POST | `/auth/otp/request` | – | `{ email, name? }` → `{ ok, devCode? }` (creates the user and STUDENT membership if new) |
| POST | `/auth/otp/verify` | – | `{ email, code }` → `{ token, user }` |
| GET | `/me` | user | `{ user, membership }` |

## Events
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/events?status=&type=&campusId=&upcoming=1` | – (public sees only ANNOUNCED and later, not DRAFT/PLANNING) | List events |
| GET | `/events/:idOrSlug` | – | Event detail with campuses, sessions, guests (public fields), counts |
| POST | `/events` | staff | Create (body: `createEventSchema`); auto-creates the checklist and default modules |
| PATCH | `/events/:id` | staff | Update fields |
| POST | `/events/:id/status` | staff | `{ status }` → validates the transition and logs activity. COMPLETED queues certificates and LinkedIn drafts |
| GET | `/events/:id/dashboard` | staff | Command-centre payload: counts, task progress by phase, judging progress, media, social, certificates, LinkedIn stats, recent activity |
| GET | `/events/:id/activity` | staff | Timeline |

## Planning
| Method | Path | Auth |
|---|---|---|
| GET/POST | `/events/:id/tasks` | staff |
| PATCH/DELETE | `/tasks/:taskId` | staff (PATCH `{ status, assigneeId, notes, evidenceUrl, dueAt }`) |
| GET/POST | `/events/:id/guests` | staff |
| PATCH/DELETE | `/guests/:guestId` | staff |
| GET/POST | `/events/:id/expenses` | staff |

## Registration and check-in
| Method | Path | Auth |
|---|---|---|
| POST | `/events/:id/register` | user, `{ answers? }` → registration with `ticketCode` |
| DELETE | `/events/:id/register` | user (cancel) |
| GET | `/me/registrations` | user, with event and ticket |
| GET | `/registrations/:ticketCode/qr.png` | user (owner) or staff → PNG QR |
| GET | `/events/:id/registrations` | staff (CSV when `?format=csv`) |
| PATCH | `/registrations/:id` | staff `{ status }` |
| POST | `/checkin` | staff/volunteer `{ ticketCode }` → `{ registration, user, alreadyCheckedIn }` |

## Teams (hackathon)
| Method | Path | Auth |
|---|---|---|
| GET | `/events/:id/teams` | user (staff sees all, with members) |
| POST | `/events/:id/teams` | registered user `{ name, trackId? }` → creates the team, caller is leader |
| POST | `/teams/join` | user `{ inviteCode }` |
| GET | `/me/teams?eventId=` | user |
| PATCH | `/teams/:id/submission` | team member `{ projectTitle, projectSummary, repoUrl, demoUrl, deckUrl, videoUrl, submit? }` |

## Judging
| Method | Path | Auth |
|---|---|---|
| GET/PUT | `/events/:id/rubric` | GET user / PUT staff `[{ name, description?, maxScore, weight }]` |
| GET/POST | `/events/:id/rounds` | staff; PATCH `/rounds/:id` `{ isOpen }` |
| GET/POST | `/events/:id/judges` | staff; POST `{ email, name?, roundId?, teamIds?[] }` creates the user and JUDGE membership if needed |
| DELETE | `/judges/:assignmentId` | staff |
| GET | `/judge/events` | judge → events where I'm assigned |
| GET | `/judge/events/:id/teams?roundId=` | judge → my teams with submission and my scores/status |
| PUT | `/judge/scores` | judge, `scoreInputSchema`; `submit: true` locks the scores |
| GET | `/events/:id/leaderboard?roundId=` | staff (public after `resultsPublishedAt`) → `[{ team, avgWeighted, judgesScored, rank }]` |
| POST | `/events/:id/results` | staff `{ awards: [{ teamId, award, rank }] }` → sets `resultsPublishedAt` |

## Media and social
| Method | Path | Auth |
|---|---|---|
| GET/POST | `/events/:id/media` | GET public (non-staff sees PHOTO_ALBUM/PHOTO/VIDEO/POSTER) / POST staff `{ kind, url, title? }` |
| DELETE | `/media/:id` | staff |
| PUT | `/events/:id/drive` | staff `{ driveFolderUrl }` (also creates a PHOTO_ALBUM media item) |
| GET/POST | `/events/:id/social` | staff |
| PATCH | `/social/:id` | staff `{ status, url, caption, metrics }` |
| GET | `/social/queue` | staff → completed events with photos but social posts not done |

## Certificates and LinkedIn
| Method | Path | Auth |
|---|---|---|
| POST | `/events/:id/certificates/generate` | staff → generates all certificates (idempotent) |
| GET | `/events/:id/certificates` | staff |
| GET | `/me/certificates` | user |
| GET | `/certificates/:serial.pdf` | – PDF |
| GET | `/verify/:serial` | – `{ valid, recipientName, type, event, issuedAt, brand }` |
| POST | `/events/:id/linkedin/generate` | staff → drafts for all participants (AI if `ANTHROPIC_API_KEY` is set, otherwise a template) |
| GET | `/me/linkedin?eventId=` | user → my drafts |
| PATCH | `/linkedin/:id` | owner `{ draft?, status?, postUrl? }` |
| GET | `/events/:id/linkedin` | staff → tracking list |

## Feedback and reports
| Method | Path | Auth |
|---|---|---|
| POST | `/events/:id/feedback` | user `{ rating, nps?, comment? }` |
| GET | `/events/:id/outcome` | staff → outcome report JSON (also cached in `Event.outcome`) |
| GET | `/dashboard` | staff → brand-level KPIs and lists |

## Admin (brand)
| Method | Path | Auth |
|---|---|---|
| GET/POST | `/admin/campuses` | brand admin |
| GET/POST | `/admin/members` | brand admin `{ email, name, role, campusId? }` |
| PATCH | `/admin/theme` | brand admin `{ theme }` |
| GET/POST | `/admin/domains` | brand admin → `{ hostname, verificationToken, cnameTarget, verifiedAt }` |
| POST | `/admin/domains/:id/verify` | brand admin → DNS TXT check of `_elevate.<hostname>` |
| GET | `/platform/tenants` / POST | platform admin |

Errors use `{ error: string, message: string }` with the usual HTTP codes.
