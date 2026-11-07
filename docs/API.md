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

---

# v1.2 additions: hackathons end to end, payments, judging checks, fests

## Event page content (rich text)
- `Event.description` is now **sanitised HTML** written in the web rich-text editor (headings, bold, italic, underline, lists, links, inline code, code blocks, quotes, images, tables). The API sanitises every HTML field on write (`sanitize-html` allow-list; `<img>` only from http(s)). Old plain-text descriptions are still valid: if a value contains no HTML tags, render it as paragraphs.
- `Event.pageSections`: `[{ id, title, html, icon? }]`, extra page sections (Eligibility, Timeline, Prizes, Rules, Judging…). `GET /page-templates/:type` → `PAGE_SECTION_TEMPLATES[type]` (from shared) to prefill.
- `POST /events` and `PATCH /events/:id` accept `pageSections`, `parentEventId`, `feeAmount`, `currency`, `feeType`, `earlyBirdAmount`, `earlyBirdEndsAt`, `submissionsOpenAt`, `submissionsCloseAt`.
- `GET /events/:idOrSlug` also returns: `pageSections`, `fee: { amount, currency, feeType, earlyBirdAmount, earlyBirdEndsAt, currentAmount } | null`, `problemStatements[]` (only released ones for non-staff; staff get all), `rubricPublic: [{ name, description, maxScore, weight, roundName? }]`, `rounds: [{ id, name, isOpen, closedAt, opensAt, closesAt }]`, `parentEvent: { slug, title } | null`, `subEvents: [{ id, slug, title, type, startsAt, mode, coverImageUrl, status }]` (public ones), `winners: [{ teamId, teamName, award, rank, projectTitle, members: [{ name, avatarUrl }] }]` once results are published, `submissionsOpenAt`, `submissionsCloseAt`, and for the logged-in user `myTeam` (team with members) and `myPayment` (latest payment).

## Problem statements
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/events/:id/problem-statements` | – | Released ones (`releaseAt` null or past) for the public; staff see all with `releaseAt` |
| POST | `/events/:id/problem-statements` | staff | `{ code?, title, html, trackId?, difficulty?, sponsorName?, attachments?: [{label,url}], releaseAt?, sortOrder? }` |
| PATCH/DELETE | `/problem-statements/:id` | staff | |

## Registration (individual or team, free or paid)
`POST /events/:id/register` body = `registerInputSchema` from shared: `{ answers, team?: { name, trackId?, problemStatementId?, members: [{ name, email, phone? }] }, couponCode? }`.
- `team` is required when the `teams` module is on and `config.teamRegistration !== "JOIN_LATER"`; with `"JOIN_LATER"` (or teams off) a person may register alone and form or join a team afterwards (existing `/events/:id/teams`, `/teams/join`).
- Team size (leader + members) must be within `config.minTeamSize..maxTeamSize`. Member emails must be unique, must not equal the leader's, and must not already be registered or in another team for this event (400 names the email).
- Members who don't have an account get a `User` (+ STUDENT membership); every member gets a `Registration` with `addedById = leader`, and a `TeamMember` row. The team is created with `registeredAsTeam: true`, leader `isLeader`.
- **Free event** (`feeAmount` 0/null): registrations get status APPROVED (REGISTERED if `requiresApproval`, WAITLISTED if over capacity, capacity counts seats). Emails: leader gets `registration.confirmed`; each member gets `team.added` ("<leader> added you to team <name> for <event>", with ticket link and "not you? leave the team" link to `/events/<slug>`).
- **Paid event**: price = `earlyBirdAmount` if `now < earlyBirdEndsAt` else `feeAmount`; × team size for PER_PERSON, × 1 for PER_TEAM; minus coupon. All registrations are created with status `PENDING_PAYMENT` and a `Payment` (status CREATED, `expiresAt` now+30 min, `receiptNo` like `ELV-2026-000123`) is linked to them. If the final amount is 0 (100% coupon) it is marked PAID straight away (provider MANUAL). Response:
  `201 { registration, team?, payment?: { id, status, amount, currency, receiptNo, provider, checkout: { keyId, orderId, amount, currency, name, description, prefill: { name, email, contact } } | null } }`.
  Capacity counts PENDING_PAYMENT seats until they expire.
- Re-registering while a CREATED payment is still valid returns the same payment (no duplicate order); after expiry a new order is made.

### Payments (Razorpay)
Config: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` in env; a brand can override with `Tenant.settings.payments = { razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret }` (secret never returned by any GET). Orders are created with `POST https://api.razorpay.com/v1/orders` (Basic auth, `{ amount, currency, receipt: receiptNo, notes: { paymentId, eventId } }`).
**Dev mode**: when no keys are configured and `NODE_ENV !== "production"`, the provider is `DEV`, `checkout` is `{ dev: true, ... }` and the web shows a "Simulate payment" button that calls `/payments/:id/dev-complete`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/payments/verify` | user | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` → HMAC-SHA256(`order_id|payment_id`, keySecret) check → marks PAID, returns `{ payment, registrations }` |
| POST | `/webhooks/razorpay` | – (signature) | `X-Razorpay-Signature` = HMAC-SHA256(raw body, webhookSecret). Handles `payment.captured` / `order.paid` (mark PAID), `payment.failed` (FAILED), `refund.processed` (REFUNDED). Idempotent. Tenant resolved from the payment row, not the host |
| POST | `/payments/:id/dev-complete` | user (owner) | Dev only. Marks PAID |
| POST | `/payments/:id/retry` | user (owner) | New order for a FAILED/EXPIRED payment (re-checks capacity) |
| GET | `/payments/:id` | owner or staff | Payment with registrations |
| GET | `/payments/:id/receipt.pdf` | owner or staff | PDF receipt (brand name, event, payer, receipt no., amount, coupon, date, Razorpay payment id) |
| GET | `/events/:id/payments?status=&format=csv` | staff | List with payer, team, amount, status; CSV export |
| POST | `/payments/:id/mark-paid` | staff | `{ notes? }` → for cash / bank transfer (provider MANUAL) |
| POST | `/payments/:id/refund` | staff | `{ amount?, reason? }` → Razorpay refund API (or just marks REFUNDED for MANUAL/DEV); registrations become CANCELLED |
| GET/POST | `/events/:id/coupons` | staff | `{ code, percentOff? \| amountOff?, maxUses?, validUntil? }` |
| PATCH/DELETE | `/coupons/:id` | staff | |
| POST | `/events/:id/coupons/check` | user | `{ code, teamSize? }` → `{ valid, discount, finalAmount, message? }` |

On PAID: registrations move PENDING_PAYMENT → APPROVED (or REGISTERED if approval needed; WAITLIST never applies to paid seats), coupon `usedCount++`, emails `payment.receipt` to the payer (amount, receipt link) and `registration.confirmed` / `team.added` as for free events. Worker: CREATED payments past `expiresAt` → EXPIRED and their registrations → CANCELLED (frees seats, promotes waitlist).

The event dashboard and outcome report gain `revenue: { paid, refunded, pending, count }`.

## Teams & submissions
- `PATCH /teams/:id` (leader or staff) now also accepts `problemStatementId`, `techStack[]`, `attachments: [{label,url,kind}]`, `projectTitle`, `projectSummary`, `repoUrl`, `demoUrl`, `deckUrl`, `videoUrl`. Submission changes are rejected outside `submissionsOpenAt..submissionsCloseAt` (when set) unless staff.
- `POST /teams/:id/submit` locks the submission (sets `submittedAt`); staff can `POST /teams/:id/unsubmit`.
- `POST /teams/:id/members` (leader, while registration is open) `{ name, email, phone? }` → adds a member like the registration flow (paid PER_PERSON events: creates an extra payment for that seat). `DELETE /teams/:id/members/:userId` (leader or the member themself; leader can't leave unless the team is empty) → that member's registration CANCELLED.
- `GET /teams/:id` returns team + members + problem statement + payment status + (if a round with `shareFeedback` is closed) `feedback: [{ roundName, averageScore, comments[], tags[] }]` without judge names.

## Judging checks (rounds), parameters and remarks
- Rounds are the admin's "checks" (First cut, Second check, …, Final). Admin creates any number, orders them, opens/closes each. Only one round may be open at a time per event (opening one closes the other).
- `POST /events/:id/rounds` `{ name, description?, opensAt?, closesAt?, restrictTeams?, shareFeedback? }`; `PATCH /rounds/:id` all of those plus `isOpen`, `sortOrder`; `DELETE /rounds/:id` (only if it has no scores).
- Criteria can be event-wide (`roundId: null`) or per round. `POST /events/:id/rubric` and `PATCH /rubric/:id` accept `roundId`. `PUT /events/:id/rubric` (bulk) accepts `[{ id?, name, description?, maxScore, weight, roundId?, sortOrder }]`.
- Library: `GET /judging/library` (staff) → `{ criteria: [...DEFAULT_CRITERIA_LIBRARY marked builtIn, ...JudgingPreset CRITERION rows], comments: [...DEFAULT_JUDGE_COMMENTS, ...COMMENT rows] }`; `POST /judging/library` `{ kind, name, description?, maxScore?, weight?, category? }`; `DELETE /judging/library/:id`. Per-event extra comment suggestions live in `Event.config.judgeComments: string[]`.
- `POST /rounds/:id/teams` (staff) `{ teamIds: [] }` sets the round's shortlist (and `restrictTeams: true`). `POST /rounds/:id/advance` (staff) `{ fromRoundId, top?: number, minScore?: number, teamIds?: [] }` → shortlists the top N / above score / chosen teams of the earlier round into this one. Response: the shortlisted teams.
- Judge view `GET /judge/events/:id?roundId=` now returns, per round, only its teams (shortlist if `restrictTeams`) and only its criteria (event-wide + round's own), plus `comments: string[]` (suggested remarks: built-in + brand + event), each team's `repoUrl/demoUrl/deckUrl/videoUrl/attachments/problemStatement/techStack/members`, and my review per team.
- `POST /judge/scores` (`scoreInputSchema`) additionally accepts `review: { comment?, tags?: string[], recommend?: boolean }`, stored as `JudgeReview` (locked together with the scores on `submit: true`).
- Leaderboard `GET /events/:id/leaderboard?roundId=` (staff) → per team: weighted total for that round (average across judges, each criterion normalised to its maxScore × weight, out of 100), per-criterion averages, judges done/assigned, `recommendCount`, all remarks (with judge names, staff only). Without `roundId`: the latest closed or open round. `GET /rounds/:id/progress` → per judge: teams scored / total.

## Results, certificates, winners
- `POST /events/:id/results` `{ results: [{ teamId, rank?, award? }], finalists?: teamId[] }` (award WINNER / RUNNER_UP / SECOND_RUNNER_UP / SPECIAL_MENTION). Publishing sets `resultsPublishedAt`, shows winners on the event page, and emails every team (`results.published`).
- Certificates on COMPLETED (or `POST /events/:id/certificates/generate`): WINNER for teams with WINNER/RUNNER_UP/SECOND_RUNNER_UP (detail "Winner — Team X", "1st runner-up — Team X"), SPECIAL_MENTION, **FINALIST** for teams in the last round's shortlist that didn't win, PARTICIPATION for everyone else who was APPROVED/CHECKED_IN (online events count APPROVED; offline only CHECKED_IN unless `config.certifyAllRegistered`). Each certificate PDF carries the serial number and a QR code that opens `/verify/<serial>`.
- `GET /winners?type=&year=` (public) → hall of fame: past events with published results and their winning teams.

## Fests (umbrella events)
- A TECH_FEST (or any event) can have sub-events (`parentEventId`). The fest page lists sub-events with their own register buttons. `GET /events?parentId=<id>` lists children.

## Photos for participants
- `POST /events/:id/gallery/notify` (staff) → emails/in-app notification `gallery.ready` to everyone who attended ("Photos from <event> are up") with the gallery link and the Drive link.
- `GET /events/:id/gallery?highlights=1` (public for ANNOUNCED+): PHOTO media, paginated `?cursor=`.
- `GET /events/:id/gallery.zip` (registered attendee or staff): ZIP of all photos (streams from storage).

## New notification kinds
`team.added`, `payment.receipt`, `payment.failed`, `payment.expired`, `results.published`, `round.opened` (to the event's judges), `gallery.ready`.
