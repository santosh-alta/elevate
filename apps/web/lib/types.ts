// Loose client-side shapes for the Elevate API (see docs/API.md). Fields are optional where the
// contract does not pin them down, so the UI degrades gracefully.
import type { BrandTheme, EventFamily, EventModules, EventStatus, EventType, Role } from "@elevate/shared";

export interface CampusDetails {
  university?: string; state?: string; region?: string; about?: string; approvals?: string[]; programme?: string; websiteUrl?: string;
  gallery?: { url: string; caption?: string }[];
}
export interface Campus { id: string; name: string; code: string; city?: string | null; region?: string | null; address?: string | null; photoUrl?: string | null; details?: CampusDetails | null }
export interface CampusSummary extends Campus { slug: string; upcoming: number; past: number }
export interface CampusProfile extends Campus {
  slug: string;
  stats: { eventsHeld: number; participants: number; hackathons: number };
  eventPhotos: { id: string; url: string; caption?: string | null; eventSlug: string; eventTitle: string }[];
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  theme: Partial<BrandTheme>;
  settings: { hashtags?: string[]; linkedinOrgUrl?: string; supportEmail?: string; tagline?: string; [k: string]: unknown };
  campuses: Campus[];
}

export interface User {
  id: string; email: string; name: string; phone?: string | null; avatarUrl?: string | null;
  linkedinUrl?: string | null; isPlatformAdmin?: boolean;
  githubUrl?: string | null; portfolioUrl?: string | null; college?: string | null; degree?: string | null;
  graduationYear?: number | null; city?: string | null; profileCompletedAt?: string | null;
}
export interface Membership { id: string; role: Role; campusId?: string | null; campus?: Campus | null; user?: User; teams?: string[]; leadTeams?: string[] }
export interface Me { user: User; membership: Membership | null }

export interface EventSession { id: string; title: string; speaker?: string | null; startsAt: string; endsAt: string; location?: string | null }
export interface GuestDocument { name: string; url: string; kind?: string }
export interface Guest {
  id: string; eventId?: string; profileId?: string | null; name: string; email?: string | null; phone?: string | null;
  designation?: string | null; organization?: string | null; bio?: string | null; photoUrl?: string | null;
  linkedinUrl?: string | null; role?: string; status?: string;
  talkTitle?: string | null; talkAbstract?: string | null; sessionAt?: string | null;
  hostUserId?: string | null; host?: User | null; arrivalAt?: string | null; departureAt?: string | null;
  travelNotes?: string | null; stayDetails?: string | null; dietary?: string | null; avRequirements?: string | null;
  consentRecording?: boolean | null; honorarium?: string | number | null; paymentStatus?: string | null;
  invoiceUrl?: string | null; mementoGiven?: boolean; invitedAt?: string | null; thankYouSentAt?: string | null;
  documents?: GuestDocument[] | null; portalToken?: string; profileSubmittedAt?: string | null;
  isPublic?: boolean; sortOrder?: number; event?: ElevateEvent; profile?: GuestProfile | null;
}
export interface GuestProfile {
  id: string; name: string; email?: string | null; phone?: string | null; designation?: string | null;
  organization?: string | null; bio?: string | null; photoUrl?: string | null; linkedinUrl?: string | null;
  websiteUrl?: string | null; city?: string | null; expertise?: string[]; notes?: string | null;
  appearances?: Guest[] | number; lastEvent?: ElevateEvent | null; _count?: Record<string, number>;
}
export interface Sponsor { id: string; name: string; logoUrl?: string | null; website?: string | null; tier?: string; sortOrder?: number }
export interface Faq { q: string; a: string }
export interface AppNotification {
  id: string; template: string; subject: string; body?: string; channel?: string; status?: string;
  toEmail?: string | null; user?: User | null; scheduledFor?: string; sentAt?: string | null; readAt?: string | null;
  createdAt: string; error?: string | null; eventId?: string | null; data?: Record<string, unknown>;
  ctaLabel?: string | null; ctaUrl?: string | null; event?: ElevateEvent | null;
}
export interface Announcement { id: string; title: string; body: string; channels?: string[]; sentAt?: string | null; createdAt: string }
export interface Track { id: string; name: string; description?: string }

export interface ElevateEvent {
  id: string; slug: string; title: string; tagline?: string | null; description?: string | null;
  type: EventType; scope: "CENTRAL" | "CAMPUS"; mode: "ONLINE" | "OFFLINE" | "HYBRID"; status: EventStatus;
  coverImageUrl?: string | null; venue?: string | null; meetingUrl?: string | null;
  startsAt: string; endsAt: string; registrationOpensAt?: string | null; registrationClosesAt?: string | null;
  capacity?: number | null; requiresApproval?: boolean;
  audienceBatches?: number[]; audiencePrograms?: string[]; notifyOnAnnounce?: boolean; remindersEnabled?: boolean; announcedNotifiedAt?: string | null;
  modules?: Partial<EventModules>;
  config?: { minTeamSize?: number; maxTeamSize?: number; tracks?: Track[]; prizes?: unknown[]; [k: string]: unknown };
  driveFolderUrl?: string | null; resultsPublishedAt?: string | null;
  outcome?: Record<string, unknown> | null;
  campuses?: (Campus | { campus: Campus })[];
  sessions?: EventSession[];
  guests?: Guest[];
  _count?: Record<string, number>;
  counts?: Record<string, number>;
  livestreamUrl?: string | null; venueMapUrl?: string | null; contactEmail?: string | null; contactPhone?: string | null;
  faqs?: Faq[] | null; previewToken?: string;
  approvalStatus?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED"; approvalNote?: string | null;
  submittedAt?: string | null; reviewedAt?: string | null; paidAllowed?: boolean; createdById?: string | null;
  ownerId?: string | null; owner?: { id: string; name: string } | null;
  checklist?: { total: number; done: number; overdue: number; proofMissing: number }; sponsors?: Sponsor[]; gallery?: Media[];
  highlights?: { id: string; platform: string; url: string | null; authorName?: string | null }[];
  registrationForm?: { id: string; label: string; type?: string; required?: boolean; options?: string[] }[];
  canManage?: boolean;
  // v1.2
  parentEventId?: string | null;
  pageSections?: PageSection[] | null;
  feeAmount?: number | null; currency?: string; feeType?: "PER_PERSON" | "PER_TEAM";
  earlyBirdAmount?: number | null; earlyBirdEndsAt?: string | null;
  submissionsOpenAt?: string | null; submissionsCloseAt?: string | null;
  fee?: EventFee | null;
  problemStatements?: ProblemStatement[];
  rubricPublic?: { name: string; description?: string | null; maxScore: number; weight: number; roundName?: string | null }[];
  rounds?: Round[];
  parentEvent?: { slug: string; title: string } | null;
  subEvents?: Pick<ElevateEvent, "id" | "slug" | "title" | "type" | "startsAt" | "mode" | "coverImageUrl" | "status" | "category" | "family" | "tags">[];
  winners?: Winner[];
  myTeam?: Team | null;
  myPayment?: Payment | null;
  // v1.3
  family?: EventFamily;
  categoryId?: string | null;
  category?: EventCategoryRef | null;
  tags?: string[];
}

/** Compact category reference carried on every event payload. */
export interface EventCategoryRef { id: string; name: string; icon?: string | null }

/** A brand's own event type (GET /event-types → families[].custom, or the admin category endpoints). */
export interface EventCategory {
  id: string; name: string; description?: string | null; icon?: string | null;
  baseType: EventType; family: EventFamily; defaultTags?: string[];
  modules?: Partial<EventModules> | null; eventCount?: number;
  archived?: boolean; archivedAt?: string | null; sortOrder?: number;
}
export interface EventTypesFamily {
  key: EventFamily; label: string; description: string; icon: string;
  types: { type: EventType; label: string; hint?: string; builtIn?: boolean }[];
  custom: EventCategory[];
}
export interface EventTypesResponse { families: EventTypesFamily[] }
export interface TagCount { tag: string; count: number }

export interface PageSection { id: string; title: string; html: string; icon?: string }
export interface EventFee {
  amount: number; currency: string; feeType: "PER_PERSON" | "PER_TEAM";
  earlyBirdAmount?: number | null; earlyBirdEndsAt?: string | null; currentAmount: number;
}
export interface Attachment { label: string; url: string; kind?: "link" | "file" | string }
export interface ProblemStatement {
  id: string; eventId?: string; trackId?: string | null; code?: string | null; title: string; html?: string | null;
  difficulty?: string | null; sponsorName?: string | null; attachments?: Attachment[] | null;
  releaseAt?: string | null; sortOrder?: number;
}
export interface Winner {
  teamId: string; teamName: string; award?: string | null; rank?: number | null; projectTitle?: string | null;
  members?: { name: string; avatarUrl?: string | null }[];
}
export interface Payment {
  id: string; eventId?: string; userId?: string; teamId?: string | null; provider?: "RAZORPAY" | "MANUAL" | "DEV" | string;
  status: "CREATED" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED" | string;
  amount: number; currency?: string; quantity?: number; discount?: number; receiptNo?: string;
  providerPaymentId?: string | null; paidAt?: string | null; refundedAt?: string | null; expiresAt?: string | null;
  createdAt?: string; notes?: string | null;
  user?: User | null; team?: { id: string; name: string } | null; event?: ElevateEvent | null;
  coupon?: { code: string } | null; registrations?: Registration[];
  checkout?: CheckoutInfo | null;
}
export interface CheckoutInfo {
  dev?: boolean; keyId?: string; orderId?: string; amount?: number; currency?: string; name?: string; description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}
export interface Coupon {
  id: string; code: string; percentOff?: number | null; amountOff?: number | null; maxUses?: number | null;
  usedCount?: number; validUntil?: string | null; active?: boolean;
}

export interface Registration {
  id: string; eventId: string; userId: string; status: string; ticketCode: string;
  checkedInAt?: string | null; createdAt: string; answers?: Record<string, unknown>;
  user?: User; event?: ElevateEvent; paymentId?: string | null; payment?: Payment | null; addedById?: string | null;
}

export interface TeamMember { userId: string; isLeader: boolean; user?: User }
export interface Team {
  id: string; eventId: string; name: string; inviteCode?: string; trackId?: string | null;
  projectTitle?: string | null; projectSummary?: string | null; repoUrl?: string | null; demoUrl?: string | null;
  deckUrl?: string | null; videoUrl?: string | null; submittedAt?: string | null;
  rank?: number | null; award?: string | null; members?: TeamMember[]; event?: ElevateEvent;
  problemStatementId?: string | null; problemStatement?: ProblemStatement | null; registeredAsTeam?: boolean;
  attachments?: Attachment[] | null; techStack?: string[];
  paymentStatus?: string | null; payment?: Payment | null; payments?: Payment[];
  feedback?: { roundName: string; averageScore?: number | null; comments?: string[]; tags?: string[] }[];
}

export interface Task {
  id: string; phase: "PRE" | "DURING" | "POST"; title: string; notes?: string | null; status: string;
  dueAt?: string | null; assigneeId?: string | null; assignee?: User | null; evidenceUrl?: string | null;
  team?: string | null; proofRequired?: boolean; eventId?: string;
  event?: { id: string; slug: string; title: string; startsAt: string; status: string };
}

export interface Criterion { id?: string; name: string; description?: string | null; maxScore: number; weight: number; roundId?: string | null; sortOrder?: number }
export interface Round {
  id: string; name: string; isOpen: boolean; closedAt?: string | null; description?: string | null;
  opensAt?: string | null; closesAt?: string | null; restrictTeams?: boolean; shareFeedback?: boolean; sortOrder?: number;
  teams?: ({ teamId: string } | { id: string; name?: string })[]; teamIds?: string[]; _count?: Record<string, number>;
}
export interface LibraryCriterion { id?: string; name: string; description?: string | null; maxScore?: number | null; weight?: number | null; category?: string | null; builtIn?: boolean }
export interface LibraryComment { id?: string; text?: string; name?: string; category?: string | null; builtIn?: boolean }
export interface JudgeAssignment { id: string; userId: string; roundId?: string | null; teamId?: string | null; user?: User; round?: Round | null; team?: Team | null }
export interface LeaderboardRow { team: Team; avgWeighted: number; judgesScored: number; rank: number }

export interface Media {
  id: string; kind: string; title?: string | null; url: string; createdAt?: string; caption?: string | null;
  mimeType?: string | null; sizeBytes?: number | null; isHighlight?: boolean; approvedForSocial?: boolean;
}
export interface SocialPost { id: string; platform: string; status: string; caption?: string | null; url?: string | null; postedAt?: string | null; generatedBy?: string | null; featured?: boolean; authorName?: string | null }

export interface Certificate {
  id: string; serial: string; type: string; recipientName: string; detail?: string | null; issuedAt: string;
  pdfUrl?: string | null; event?: ElevateEvent; user?: User;
}
export interface LinkedInPost {
  id: string; eventId: string; draft: string; status: string; postUrl?: string | null; generatedBy?: string;
  event?: ElevateEvent; user?: User;
}
export interface Activity { id: string; action: string; data?: Record<string, unknown>; createdAt: string; actor?: User | null }
export interface Domain { id: string; hostname: string; isPrimary?: boolean; verificationToken: string; cnameTarget?: string; verifiedAt?: string | null }
export interface VerifyResult {
  valid: boolean; recipientName?: string; type?: string; detail?: string | null;
  event?: { title: string; startsAt?: string; slug?: string }; issuedAt?: string; brand?: { name: string } | string;
}
