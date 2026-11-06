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

---

# v1.1 additions (guests, event page, uploads, notifications)

## Event page
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/events/:idOrSlug?preview=<previewToken>` | – | A valid preview token shows DRAFT/PLANNING events (used for "Preview page" links). Detail now includes `sponsors[]`, `faqs[]`, `livestreamUrl`, `venueMapUrl`, `contactEmail`, `contactPhone`, `gallery[]` (PHOTO media, highlights first), public guests with `talkTitle`, `sessionAt`, `role` and `profileId`; staff also get `previewToken` |
| GET | `/events/:idOrSlug/calendar.ics` | – | iCalendar file (VEVENT with title, description, location or meeting link, URL) |
| POST | `/events/:id/clone` | staff | `{ title?, startsAt?, endsAt? }` → new DRAFT event copying details, modules, config, form, rubric, sessions (shifted), sponsors, guests (status PROPOSED) and a fresh checklist |
| GET | `/events/calendar?from=&to=` | staff | Events in range (all statuses) for the admin calendar |
| GET/POST | `/events/:id/sponsors` | GET – / POST staff `{ name, logoUrl?, website?, tier?, sortOrder? }` |
| PATCH/DELETE | `/sponsors/:id` | staff |

`PATCH /events/:id` also accepts `faqs`, `livestreamUrl`, `venueMapUrl`, `contactEmail`, `contactPhone`.
The web app builds the public page as `/events/<slug>`; creating an event makes that page immediately (visible publicly from ANNOUNCED on, or with the preview token before).

## Guests (the guest "file")
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/guest-profiles?q=` | staff | Brand guest library with `appearances` count and last event |
| POST | `/guest-profiles` | staff | Create a profile |
| GET/PATCH | `/guest-profiles/:id` | staff | Profile with every appearance (event, role, talk, status) |
| POST | `/events/:id/guests` | staff | Accepts `profileId` (copies profile fields) or raw fields; creates or links a GuestProfile by email/name. All new EventGuest fields are accepted |
| PATCH | `/guests/:id` | staff | All EventGuest fields; `syncProfile: true` also writes public fields back to the profile |
| GET | `/guests/:id/brief` | staff | Guest brief JSON: guest, profile, event, sessions, host contact, logistics, checklist items mentioning guests, documents |
| POST | `/guests/:id/invite` | staff | Queues the invite email (with the portal link) and sets status INVITED and `invitedAt` |
| POST | `/guests/:id/thank-you` | staff | Queues the thank-you email (with certificate link if issued), sets status THANKED and `thankYouSentAt` |
| GET | `/guest-portal/:token` | – (token) | What the guest sees: event basics and their editable fields |
| PUT | `/guest-portal/:token` | – (token) | Guest submits `{ name, designation, organization, bio, linkedinUrl, photoUrl, talkTitle, talkAbstract, arrivalAt, departureAt, dietary, avRequirements, consentRecording, phone }` → sets `profileSubmittedAt`, status CONFIRMED if it was INVITED, logs activity |
| POST | `/guest-portal/:token/upload` | – (token) | Multipart photo upload, returns `{ url }` |
| GET | `/speakers/:guestId` | – | Public speaker page data (public fields only, plus their public events in this brand) |

Certificates: guests receive SPEAKER/JUDGE/MENTOR certificates even without a user account (`Certificate.guestId`).

## Uploads (photos, posters, documents)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/uploads` | user | Multipart `file` (images, PDF, up to 15 MB) + optional `eventId`, `kind`, `caption`. When `eventId` + `kind` are given and the caller is staff/volunteer on the event, a MediaAsset is created. Returns `{ url, key, media? }` |
| GET | `/files/*` | – | Serves stored files (local driver). In production the S3 driver returns public URLs instead |
| PATCH | `/media/:id` | staff | `{ caption, isHighlight, approvedForSocial, kind }` |

## Notifications
Every outgoing message is a `Notification` row (outbox). A worker inside the API sends due rows every 30 s: EMAIL through SMTP (`SMTP_URL`) or logs it in development; IN_APP rows are just stored.
Automatic messages: `registration.confirmed` (with ticket and calendar link), `registration.waitlisted`, `registration.approved`, `event.reminder.24h`, `event.reminder.1h`, `event.cancelled`, `event.updated` (time or venue changed), `feedback.request` (on COMPLETED), `certificate.ready`, `linkedin.ready`, `guest.invite`, `guest.thank_you`, `guest.reminder` (2 days before, if profile not submitted), `task.overdue` (daily digest to assignees). Announcements with channels EMAIL/IN_APP fan out to registrants.

| Method | Path | Auth |
|---|---|---|
| GET | `/me/notifications?unread=1` | user → IN_APP rows |
| POST | `/me/notifications/read` | user `{ ids?: string[] }` (none = all) |
| GET | `/events/:id/notifications` | staff → outbox rows for the event with status |
| POST | `/events/:id/announcements/:announcementId/send` | staff → fan out now |

## Social media captions
| Method | Path | Auth |
|---|---|---|
| POST | `/events/:id/social/suggest` | staff `{ platforms?: [...] }` → creates or refreshes DRAFTED SocialPost rows with a caption per platform (AI if a key is set, else template), using event outcome, guests, winners and brand hashtags |
