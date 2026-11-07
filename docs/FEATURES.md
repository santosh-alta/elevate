# Elevate feature checklist

How Elevate covers the full life of any event (hackathon, seminar, workshop, entrepreneurship session, conference,
career fair, and others), measured against what dedicated event platforms offer.

Status: **Built** = in the code and tested · **Later** = planned (see roadmap in PLAN.md)

## 1. Setting up an event
| Feature | Status |
|---|---|
| 19 event types: hackathon, seminar, workshop, guest lecture, competition, bootcamp, webinar, cultural, **entrepreneurship, startup pitch, conference, panel discussion, meetup, career fair, industry visit, orientation, alumni meet, sports, tech fest**, other | Built |
| Central or campus-level, multiple campuses, online / offline / hybrid | Built |
| Venue, meeting link, livestream link, map link, organiser contact | Built |
| Dates, registration window, capacity, approval required | Built |
| Feature modules per event (teams, judging, submissions, guests, check-in, certificates, feedback, budget, sponsors) with smart defaults per type | Built |
| Planning checklist created automatically from a template per type (before / during / after), with owners and due dates | Built |
| Duplicate an event (reuse last year's setup) | Built |
| Admin calendar view across campuses | Built |
| Tech fests: an umbrella event with sub-events (hackathon, workshops, talks), each with its own registration | Built |
| Approval of campus events by brand admin before publishing | Later |

## 2. Event page (created automatically)
| Feature | Status |
|---|---|
| Public page on the brand's own domain as soon as the event is created (public from "Announced") | Built |
| Private preview link for drafts | Built |
| Hero, badges, agenda, register button, results | Built |
| Rich text editor (headings, bold, code, images, tables, links) for the description and extra sections (rules, prizes, timeline, eligibility) with templates per type | Built |
| Problem statements with tracks and attachments, hidden until a release time (online hackathons) | Built |
| Public judging parameters, price with early-bird, winners podium, section menu | Built |
| Speakers section with public speaker pages | Built |
| Sponsors by tier, FAQs, photo gallery, livestream, map, contact | Built |
| Share to WhatsApp / LinkedIn / X, copy link, social preview card | Built |
| Add to calendar (.ics and Google Calendar) | Built |

## 3. Guests and speakers (the guest "file")
| Feature | Status |
|---|---|
| Guest per event with role (speaker, chief guest, panelist, moderator, judge, mentor, investor) and status (proposed → invited → confirmed → arrived → thanked) | Built |
| Full guest file: photo, bio, designation, organisation, LinkedIn, talk title and abstract, session time, our point of contact, arrival and departure, stay, dietary needs, AV needs, recording consent, honorarium and payment status, invoice, documents, memento | Built |
| Brand-wide guest library: reuse a guest across events, see every event they attended | Built |
| Guest self-service link: the guest fills their own profile and uploads their photo, no login | Built |
| Printable guest brief for the host | Built |
| Invite and thank-you emails | Built |
| Speaker certificate even if the guest has no account | Built |

## 4. Registration and attendance
| Feature | Status |
|---|---|
| Login with email code; custom registration questions | Built |
| Capacity, waitlist with automatic promotion, approval | Built |
| QR ticket; QR check-in on the phone; manual code entry | Built |
| Registration list, CSV export, attendance stats | Built |
| Confirmation email with ticket and calendar link; 24-hour and 1-hour reminders | Built |
| Team registration in one form: team name, track, problem statement, member list (members get an account, ticket and email) | Built |
| Paid registration with Razorpay: per person or per team, early-bird price, coupons, receipt PDF and email, refunds, cash/bank mark-paid, unpaid orders expire after 30 min | Built (test mode until keys are added) |
| Registrations from other colleges / public | Built (anyone can sign up with email) |

## 5. Hackathons, competitions and pitches
| Feature | Status |
|---|---|
| Teams with invite codes, size limits, tracks | Built |
| Submissions (repo, demo, deck, video, tech stack, extra files) with a submission window and final lock | Built |
| Rubric with weights, rounds, judges assigned per team or round | Built |
| Judging checks (first cut, second check, final…): admin opens one at a time, moves top N teams to the next check, different parameters per check | Built |
| Parameter library (14 built-in plus the brand's own) and custom parameters per event | Built |
| Judge remarks: suggested comments, own comment, "recommend for next round"; optional feedback shared with teams | Built |
| Mobile scoring by judges, lock on submit, live weighted leaderboard | Built |
| Publish results with awards and finalists; results email to every team | Built |
| Public winners hall of fame | Built |

## 6. Photos, media and social
| Feature | Status |
|---|---|
| Drive folder link per event | Built |
| Direct photo upload from web (drag and drop) and phone camera | Built |
| Gallery with highlights, captions, "approved for social" | Built |
| Social post tracker per platform (planned → drafted → posted, link, reach) | Built |
| "Ready for social" queue for the social media team | Built |
| Suggested captions per platform (AI or template) | Built |
| "Photos are up" email to attendees, download all photos as ZIP | Built |

## 7. After the event (automatic)
| Feature | Status |
|---|---|
| Certificates for participants, finalists, winners, judges, volunteers, speakers; PDF; public verification; Add to LinkedIn | Built |
| Personalised LinkedIn post draft for every participant; share; track who posted | Built |
| Feedback form (rating, NPS, comments) | Built |
| Outcome report (registrations, attendance, campus split, winners, feedback, photos, social, certificates, LinkedIn, budget) | Built |
| Budget vs actual with receipts | Built |

## 8. Communication
| Feature | Status |
|---|---|
| Announcements to registrants (email and in-app) | Built |
| Email outbox with retries, brand-styled emails | Built |
| In-app notifications on web and mobile | Built |
| Overdue task digest to owners | Built |
| WhatsApp and push notifications | Later |

## 9. Dashboards, roles and brands
| Feature | Status |
|---|---|
| Brand dashboard, event command centre, activity timeline | Built |
| Roles: platform admin, brand admin, campus admin, event manager, judge, volunteer, speaker, student | Built |
| White-label: domain per brand, theme editor, DNS verification, per-brand mobile apps | Built |
| Database-level brand isolation, SSO | Later |
