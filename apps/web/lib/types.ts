// Loose client-side shapes for the Elevate API (see docs/API.md). Fields are optional where the
// contract does not pin them down, so the UI degrades gracefully.
import type { BrandTheme, EventModules, EventStatus, EventType, Role } from "@elevate/shared";

export interface Campus { id: string; name: string; code: string; city?: string | null; address?: string | null }

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
}
export interface Membership { id: string; role: Role; campusId?: string | null; campus?: Campus | null; user?: User }
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
  faqs?: Faq[] | null; previewToken?: string; sponsors?: Sponsor[]; gallery?: Media[];
  registrationForm?: { id: string; label: string; type?: string; required?: boolean; options?: string[] }[];
  canManage?: boolean;
}

export interface Registration {
  id: string; eventId: string; userId: string; status: string; ticketCode: string;
  checkedInAt?: string | null; createdAt: string; answers?: Record<string, unknown>;
  user?: User; event?: ElevateEvent;
}

export interface TeamMember { userId: string; isLeader: boolean; user?: User }
export interface Team {
  id: string; eventId: string; name: string; inviteCode?: string; trackId?: string | null;
  projectTitle?: string | null; projectSummary?: string | null; repoUrl?: string | null; demoUrl?: string | null;
  deckUrl?: string | null; videoUrl?: string | null; submittedAt?: string | null;
  rank?: number | null; award?: string | null; members?: TeamMember[]; event?: ElevateEvent;
}

export interface Task {
  id: string; phase: "PRE" | "DURING" | "POST"; title: string; notes?: string | null; status: string;
  dueAt?: string | null; assigneeId?: string | null; assignee?: User | null; evidenceUrl?: string | null;
}

export interface Criterion { id?: string; name: string; description?: string | null; maxScore: number; weight: number }
export interface Round { id: string; name: string; isOpen: boolean; closedAt?: string | null }
export interface JudgeAssignment { id: string; userId: string; roundId?: string | null; teamId?: string | null; user?: User; round?: Round | null; team?: Team | null }
export interface LeaderboardRow { team: Team; avgWeighted: number; judgesScored: number; rank: number }

export interface Media {
  id: string; kind: string; title?: string | null; url: string; createdAt?: string; caption?: string | null;
  mimeType?: string | null; sizeBytes?: number | null; isHighlight?: boolean; approvedForSocial?: boolean;
}
export interface SocialPost { id: string; platform: string; status: string; caption?: string | null; url?: string | null; postedAt?: string | null; generatedBy?: string | null }

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
