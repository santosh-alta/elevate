/**
 * Demo data: three brands with their own domains/themes, campuses, staff, students and sample events.
 * Run: npm run seed -w @elevate/api   (wipes existing data first)
 */
import { PrismaClient, type EventType, type Prisma } from "@prisma/client";
import { ALTA_SETTINGS, ALTA_THEME, DEFAULT_CHECKLISTS, DEFAULT_CRITERIA_LIBRARY, DEFAULT_MODULES, PAGE_SECTION_TEMPLATES } from "@elevate/shared";
import { certificateSerial, teamInviteCode } from "../src/lib/codes";
import { generateCertificates } from "../src/lib/certificates";
import { generateLinkedInDrafts } from "../src/lib/linkedin";
import { buildOutcome } from "../src/lib/outcome";

process.env.ELEVATE_SEEDING = "1"; // no automatic emails for demo data
const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(Date.now() + n * DAY);

const BRANDS = [
  {
    slug: "altaschool",
    name: "Alta School of Technology",
    domains: ["event.altaschool.tech", "altaschool.localhost"],
    theme: ALTA_THEME,
    settings: ALTA_SETTINGS,
    campuses: [
      { name: "Bengaluru Campus", code: "BLR", city: "Bengaluru" },
      { name: "Pune Campus", code: "PUN", city: "Pune" },
      { name: "Delhi NCR Campus", code: "DEL", city: "Gurugram" },
    ],
  },
  {
    slug: "sunstone",
    name: "Sunstone",
    domains: ["event.sunstone.in", "sunstone.localhost"],
    theme: {
      colors: { primary: "#d97706", primaryFg: "#ffffff", accent: "#0f766e", bg: "#fffbeb", fg: "#1c1917", muted: "#78716c", card: "#ffffff", border: "#f5e6c8" },
      font: "Poppins",
      radius: 16,
    },
    settings: { hashtags: ["Sunstone", "SunstoneEdu", "CareerReady"], supportEmail: "events@sunstone.in" },
    campuses: [
      { name: "Sunstone @ Mumbai", code: "MUM", city: "Mumbai" },
      { name: "Sunstone @ Hyderabad", code: "HYD", city: "Hyderabad" },
    ],
  },
  {
    slug: "mirai",
    name: "Mirai",
    domains: ["mirai.localhost"],
    theme: {
      colors: { primary: "#7c3aed", primaryFg: "#ffffff", accent: "#ec4899", bg: "#faf5ff", fg: "#1e1b4b", muted: "#6b7280", card: "#ffffff", border: "#e9d5ff" },
      font: "Space Grotesk",
      radius: 10,
    },
    settings: { hashtags: ["Mirai", "FutureReady"], supportEmail: "events@mirai.example" },
    campuses: [
      { name: "Mirai Chennai", code: "CHE", city: "Chennai" },
      { name: "Mirai Online", code: "ONL", city: null },
    ],
  },
] as const;

const FIRST = ["Aarav", "Diya", "Vihaan", "Ananya", "Arjun", "Isha", "Kabir", "Meera", "Rohan", "Saanvi", "Aditya", "Kavya", "Ishaan", "Riya", "Dev", "Tara", "Neel", "Priya", "Yash", "Zoya", "Om", "Nisha"];
const LAST = ["Sharma", "Iyer", "Reddy", "Mehta", "Khan", "Nair", "Gupta", "Das", "Patel", "Singh", "Rao"];

async function reset() {
  // Children first; most relations cascade from Event/Tenant/User anyway.
  await prisma.eventActivity.deleteMany();
  await prisma.score.deleteMany();
  await prisma.event.deleteMany();
  await prisma.taskTemplate.deleteMany();
  await prisma.certificateTemplate.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.campus.deleteMany();
  await prisma.tenantDomain.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.user.deleteMany();
}

async function user(email: string, name: string, extra: Partial<Prisma.UserCreateInput> = {}) {
  return prisma.user.create({ data: { email, name, ...extra } });
}

function checklist(type: EventType, startsAt: Date, doneBefore?: Date) {
  return DEFAULT_CHECKLISTS[type].map((t, i) => {
    const dueAt = new Date(startsAt.getTime() + t.dueOffsetDays * DAY);
    const done = doneBefore ? dueAt <= doneBefore : false;
    return { phase: t.phase, title: t.title, sortOrder: i, dueAt, status: done ? ("DONE" as const) : ("TODO" as const), completedAt: done ? dueAt : null };
  });
}

async function main() {
  await reset();

  const platformAdmin = await user("admin@elevate.dev", "Elevate Admin", { isPlatformAdmin: true });
  const tenants: Record<string, { id: string; campuses: { id: string; code: string }[] }> = {};

  for (const b of BRANDS) {
    const t = await prisma.tenant.create({
      data: {
        slug: b.slug,
        name: b.name,
        theme: b.theme as unknown as Prisma.InputJsonValue,
        settings: b.settings as unknown as Prisma.InputJsonValue,
        domains: { create: b.domains.map((hostname, i) => ({ hostname, isPrimary: i === 0, verifiedAt: new Date() })) },
        campuses: { create: b.campuses.map((c) => ({ name: c.name, code: c.code, city: c.city })) },
      },
      include: { campuses: true },
    });
    tenants[b.slug] = { id: t.id, campuses: t.campuses };
    await prisma.membership.create({ data: { tenantId: t.id, userId: platformAdmin.id, role: "BRAND_ADMIN" } });
    const admin = await user(`admin@${b.slug}.dev`, `${b.name} Admin`);
    await prisma.membership.create({ data: { tenantId: t.id, userId: admin.id, role: "BRAND_ADMIN" } });
    const campusAdmin = await user(`campus@${b.slug}.dev`, `${b.campuses[0].city ?? "Online"} Campus Admin`);
    await prisma.membership.create({ data: { tenantId: t.id, userId: campusAdmin.id, role: "CAMPUS_ADMIN", campusId: t.campuses[0].id } });
  }

  // Students: 22 on Alta, 12 on Sunstone (some overlap is realistic but keep it simple).
  const students: Record<string, string[]> = { altaschool: [], sunstone: [], mirai: [] };
  for (let i = 0; i < 22; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
    const u = await user(`student${i + 1}@example.com`, name, { linkedinUrl: `https://www.linkedin.com/in/student-${i + 1}` });
    const slug = i < 14 ? "altaschool" : i < 20 ? "sunstone" : "mirai";
    const t = tenants[slug];
    await prisma.membership.create({
      data: { tenantId: t.id, userId: u.id, role: "STUDENT", campusId: t.campuses[i % t.campuses.length].id, batch: "2025-29", rollNo: `R${1000 + i}` },
    });
    students[slug].push(u.id);
    if (slug === "sunstone" || i < 4) {
      // A few Alta students also study at Sunstone programs.
      if (slug !== "sunstone") {
        const s = tenants.sunstone;
        await prisma.membership.create({ data: { tenantId: s.id, userId: u.id, role: "STUDENT", campusId: s.campuses[0].id } });
        students.sunstone.push(u.id);
      }
    }
  }

  const judge = await user("judge@elevate.dev", "Neha Kapoor", { linkedinUrl: "https://www.linkedin.com/in/neha-kapoor" });
  const judge2 = await user("judge2@elevate.dev", "Rahul Verma");
  const volunteer = await user("volunteer@elevate.dev", "Sameer Joshi");
  for (const u of [judge, judge2]) await prisma.membership.create({ data: { tenantId: tenants.altaschool.id, userId: u.id, role: "JUDGE" } });
  await prisma.membership.create({ data: { tenantId: tenants.altaschool.id, userId: volunteer.id, role: "VOLUNTEER" } });
  await prisma.membership.create({ data: { tenantId: tenants.sunstone.id, userId: volunteer.id, role: "VOLUNTEER" } });

  // ───────── Alta: hackathon in progress (judging) ─────────
  const alta = tenants.altaschool;
  const hackStart = days(-1);
  const hackathon = await prisma.event.create({
    data: {
      tenantId: alta.id,
      slug: "alta-hacks-2026",
      title: "Alta Hacks 2026",
      tagline: "36 hours to build something that matters",
      description: "Our flagship inter-campus hackathon. Form teams of 2–4, pick a track, and build.",
      type: "HACKATHON",
      scope: "CENTRAL",
      mode: "OFFLINE",
      status: "JUDGING",
      venue: "Bengaluru Campus, Main Auditorium",
      startsAt: hackStart,
      endsAt: days(0.5),
      registrationOpensAt: days(-30),
      registrationClosesAt: days(-3),
      capacity: 200,
      modules: { ...DEFAULT_MODULES.HACKATHON },
      config: {
        minTeamSize: 2,
        maxTeamSize: 4,
        tracks: [
          { id: "edtech", name: "EdTech", description: "Tools that make learning better" },
          { id: "climate", name: "Climate", description: "Sustainability and climate action" },
          { id: "open", name: "Open innovation", description: "Anything goes" },
        ],
        prizes: [{ place: 1, prize: "₹50,000" }, { place: 2, prize: "₹25,000" }, { place: 3, prize: "₹10,000" }],
      },
      driveFolderUrl: "https://drive.google.com/drive/folders/alta-hacks-2026-demo",
      createdById: platformAdmin.id,
      campuses: { create: alta.campuses.map((c) => ({ campusId: c.id })) },
      staff: { create: [{ userId: volunteer.id, role: "VOLUNTEER" }] },
      tasks: { create: checklist("HACKATHON", hackStart, days(0)) },
      rubric: {
        create: [
          { name: "Innovation", description: "Originality and creativity", maxScore: 10, weight: 1.5, sortOrder: 0 },
          { name: "Technical execution", description: "Quality of the build", maxScore: 10, weight: 1.5, sortOrder: 1 },
          { name: "Impact", description: "Real-world usefulness", maxScore: 10, weight: 1, sortOrder: 2 },
          { name: "Presentation", description: "Demo and pitch", maxScore: 10, weight: 1, sortOrder: 3 },
        ],
      },
      rounds: { create: [{ name: "Final", sortOrder: 0, isOpen: true }] },
      media: {
        create: [
          { kind: "PHOTO_ALBUM", url: "https://drive.google.com/drive/folders/alta-hacks-2026-demo", title: "Day 1 photos" },
          { kind: "POSTER", url: "https://example.com/posters/alta-hacks-2026.png", title: "Main poster" },
        ],
      },
    },
    include: { rubric: true, rounds: true },
  });

  const altaStudents = students.altaschool;
  for (const [i, userId] of altaStudents.entries()) {
    await prisma.registration.create({
      data: { eventId: hackathon.id, userId, status: i < 12 ? "CHECKED_IN" : "APPROVED", checkedInAt: i < 12 ? hackStart : null, checkedInById: volunteer.id },
    });
  }
  const teamDefs = [
    { name: "Byte Me", track: "edtech", title: "StudyBuddy AI", members: altaStudents.slice(0, 3) },
    { name: "Carbon Cutters", track: "climate", title: "GreenCommute", members: altaStudents.slice(3, 6) },
    { name: "Null Pointers", track: "open", title: "CampusConnect", members: altaStudents.slice(6, 9) },
    { name: "Stack Smashers", track: "edtech", title: "LabLens", members: altaStudents.slice(9, 12) },
  ];
  const teams = [];
  for (const d of teamDefs) {
    teams.push(
      await prisma.team.create({
        data: {
          eventId: hackathon.id,
          name: d.name,
          trackId: d.track,
          inviteCode: teamInviteCode(),
          projectTitle: d.title,
          projectSummary: `${d.title} — built at Alta Hacks 2026.`,
          repoUrl: `https://github.com/example/${d.title.toLowerCase()}`,
          demoUrl: `https://${d.title.toLowerCase()}.example.com`,
          submittedAt: days(-0.2),
          members: { create: d.members.map((userId, i) => ({ userId, isLeader: i === 0 })) },
        },
      }),
    );
  }
  await prisma.judgeAssignment.create({ data: { eventId: hackathon.id, userId: judge.id } }); // all teams
  await prisma.judgeAssignment.create({ data: { eventId: hackathon.id, userId: judge2.id, teamId: teams[0].id } });
  await prisma.judgeAssignment.create({ data: { eventId: hackathon.id, userId: judge2.id, teamId: teams[1].id } });

  const round = hackathon.rounds[0];
  const sample = [
    [9, 8, 9, 8],
    [7, 8, 9, 7],
    [8, 6, 7, 9],
  ];
  // Judge 1 submitted three teams; judge 2 submitted team 0 and has a draft on team 1.
  for (const [ti, values] of sample.entries()) {
    for (const [ci, c] of hackathon.rubric.sort((a, b) => a.sortOrder - b.sortOrder).entries()) {
      await prisma.score.create({ data: { roundId: round.id, teamId: teams[ti].id, judgeId: judge.id, criterionId: c.id, value: values[ci], submittedAt: new Date() } });
    }
  }
  for (const c of hackathon.rubric) {
    await prisma.score.create({ data: { roundId: round.id, teamId: teams[0].id, judgeId: judge2.id, criterionId: c.id, value: 8, submittedAt: new Date() } });
    await prisma.score.create({ data: { roundId: round.id, teamId: teams[1].id, judgeId: judge2.id, criterionId: c.id, value: 7 } });
  }
  await prisma.eventActivity.createMany({
    data: [
      { eventId: hackathon.id, actorId: platformAdmin.id, action: "status.changed", data: { from: "LIVE", to: "JUDGING" } },
      { eventId: hackathon.id, actorId: judge.id, action: "scores.submitted", data: { team: "Byte Me" } },
    ],
  });

  // ───────── Alta: upcoming workshop at one campus ─────────
  const wsStart = days(10);
  await prisma.event.create({
    data: {
      tenantId: alta.id,
      slug: "intro-to-genai-workshop",
      title: "Intro to GenAI Workshop",
      tagline: "Hands-on: build your first AI app in 3 hours",
      type: "WORKSHOP",
      scope: "CAMPUS",
      mode: "OFFLINE",
      status: "REGISTRATION_OPEN",
      venue: "Pune Campus, Lab 2",
      startsAt: wsStart,
      endsAt: new Date(wsStart.getTime() + 3 * 60 * 60 * 1000),
      registrationOpensAt: days(-2),
      registrationClosesAt: days(9),
      capacity: 60,
      modules: { ...DEFAULT_MODULES.WORKSHOP },
      registrationForm: [
        { id: "laptop", label: "Will you bring a laptop?", type: "select", required: true, options: ["Yes", "No"] },
        { id: "experience", label: "Prior coding experience", type: "textarea", required: false },
      ],
      createdById: platformAdmin.id,
      campuses: { create: [{ campusId: alta.campuses.find((c) => c.code === "PUN")!.id }] },
      tasks: { create: checklist("WORKSHOP", wsStart, days(0)) },
      guests: {
        create: [{ name: "Ankit Bose", designation: "ML Engineer", organization: "Example AI Labs", role: "SPEAKER", status: "CONFIRMED", email: "ankit@example.com" }],
      },
      sessions: {
        create: [
          { title: "What is GenAI?", speaker: "Ankit Bose", startsAt: wsStart, endsAt: new Date(wsStart.getTime() + 60 * 60 * 1000) },
          { title: "Build-along", speaker: "Ankit Bose", startsAt: new Date(wsStart.getTime() + 60 * 60 * 1000), endsAt: new Date(wsStart.getTime() + 3 * 60 * 60 * 1000) },
        ],
      },
    },
  });

  // ───────── Sunstone: completed seminar ─────────
  const sun = tenants.sunstone;
  const semStart = days(-7);
  const speaker = await user("speaker@example.com", "Dr. Kavita Menon", { linkedinUrl: "https://www.linkedin.com/in/kavita-menon" });
  await prisma.membership.create({ data: { tenantId: sun.id, userId: speaker.id, role: "SPEAKER" } });
  const seminar = await prisma.event.create({
    data: {
      tenantId: sun.id,
      slug: "future-of-work-seminar",
      title: "The Future of Work: AI and Careers",
      tagline: "A conversation with Dr. Kavita Menon",
      type: "SEMINAR",
      scope: "CAMPUS",
      mode: "HYBRID",
      status: "COMPLETED",
      venue: "Sunstone @ Mumbai, Seminar Hall",
      meetingUrl: "https://meet.example.com/future-of-work",
      startsAt: semStart,
      endsAt: new Date(semStart.getTime() + 2 * 60 * 60 * 1000),
      registrationOpensAt: days(-21),
      registrationClosesAt: days(-8),
      capacity: 150,
      modules: { ...DEFAULT_MODULES.SEMINAR },
      driveFolderUrl: "https://drive.google.com/drive/folders/future-of-work-demo",
      createdById: platformAdmin.id,
      campuses: { create: [{ campusId: sun.campuses[0].id }] },
      staff: { create: [{ userId: volunteer.id, role: "VOLUNTEER" }] },
      tasks: { create: checklist("SEMINAR", semStart, days(-5)) },
      guests: {
        create: [
          {
            name: "Dr. Kavita Menon",
            email: "speaker@example.com",
            designation: "Head of Talent Research",
            organization: "Example Corp",
            bio: "Kavita researches how AI is changing hiring and careers.",
            photoUrl: "https://example.com/guests/kavita.jpg",
            role: "SPEAKER",
            status: "THANKED",
            mementoGiven: true,
            thankYouSentAt: days(-6),
          },
        ],
      },
      media: {
        create: [
          { kind: "PHOTO_ALBUM", url: "https://drive.google.com/drive/folders/future-of-work-demo", title: "Seminar photos" },
          { kind: "GUEST_PHOTO", url: "https://example.com/guests/kavita.jpg", title: "Speaker photo" },
          { kind: "VIDEO", url: "https://youtube.com/watch?v=demo", title: "Recording" },
        ],
      },
      socialPosts: {
        create: [
          { platform: "LINKEDIN", status: "POSTED", url: "https://www.linkedin.com/posts/sunstone-demo", postedAt: days(-6), metrics: { impressions: 4200, likes: 180, comments: 12, shares: 9 } },
          { platform: "INSTAGRAM", status: "POSTED", url: "https://instagram.com/p/demo", postedAt: days(-6), metrics: { likes: 320 } },
          { platform: "X", status: "DRAFTED", caption: "What a session on AI and careers!" },
        ],
      },
      expenses: {
        create: [
          { category: "MEMENTO", description: "Speaker memento", planned: 2500, actual: 2200 },
          { category: "FOOD", description: "Tea and snacks", planned: 6000, actual: 6800 },
          { category: "TRAVEL", description: "Speaker cab", planned: 1500, actual: 1200 },
        ],
      },
    },
  });
  for (const [i, userId] of students.sunstone.entries()) {
    const attended = i % 5 !== 4;
    await prisma.registration.create({
      data: { eventId: seminar.id, userId, status: attended ? "CHECKED_IN" : "NO_SHOW", checkedInAt: attended ? semStart : null, checkedInById: volunteer.id },
    });
    if (attended && i % 2 === 0) {
      await prisma.feedback.create({ data: { eventId: seminar.id, userId, rating: 4 + (i % 2), nps: 8 + (i % 3), comment: "Very insightful session." } });
    }
  }
  await generateCertificates(seminar.id);
  await generateLinkedInDrafts(seminar.id);
  // Mark a few drafts as posted so the tracker has data.
  const drafts = await prisma.linkedInPost.findMany({ where: { eventId: seminar.id }, take: 3 });
  for (const d of drafts) {
    await prisma.linkedInPost.update({ where: { id: d.id }, data: { status: "POSTED", postUrl: `https://www.linkedin.com/posts/demo-${d.id}`, postedAt: days(-5) } });
  }
  await prisma.eventActivity.createMany({
    data: [
      { eventId: seminar.id, actorId: platformAdmin.id, action: "status.changed", data: { from: "LIVE", to: "COMPLETED" } },
      { eventId: seminar.id, actorId: platformAdmin.id, action: "drive.linked", data: { url: "https://drive.google.com/drive/folders/future-of-work-demo" } },
    ],
  });
  await buildOutcome(seminar.id);

  // ───────── Sunstone: planning a guest lecture; Mirai: a webinar draft ─────────
  const glStart = days(21);
  await prisma.event.create({
    data: {
      tenantId: sun.id,
      slug: "guest-lecture-product-management",
      title: "Guest Lecture: Breaking into Product Management",
      type: "GUEST_LECTURE",
      scope: "CAMPUS",
      mode: "OFFLINE",
      status: "PLANNING",
      startsAt: glStart,
      endsAt: new Date(glStart.getTime() + 90 * 60 * 1000),
      modules: { ...DEFAULT_MODULES.GUEST_LECTURE },
      createdById: platformAdmin.id,
      campuses: { create: [{ campusId: sun.campuses[1].id }] },
      tasks: { create: checklist("GUEST_LECTURE", glStart, days(0)) },
      guests: { create: [{ name: "Arjun Malhotra", designation: "Director of Product", organization: "Example Fintech", status: "INVITED" }] },
    },
  });
  const mirai = tenants.mirai;
  const webStart = days(14);
  await prisma.event.create({
    data: {
      tenantId: mirai.id,
      slug: "mirai-open-day-webinar",
      title: "Mirai Open Day Webinar",
      type: "WEBINAR",
      scope: "CENTRAL",
      mode: "ONLINE",
      status: "ANNOUNCED",
      meetingUrl: "https://meet.example.com/mirai-open-day",
      startsAt: webStart,
      endsAt: new Date(webStart.getTime() + 60 * 60 * 1000),
      modules: { ...DEFAULT_MODULES.WEBINAR },
      createdById: platformAdmin.id,
      tasks: { create: checklist("WEBINAR", webStart, days(0)) },
    },
  });

  // ───────── Sunstone: entrepreneurship event with full guest files, sponsor and FAQs ─────────
  const sunAdmin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@sunstone.dev" } });
  const founder = await prisma.guestProfile.create({
    data: {
      tenantId: sun.id,
      name: "Nandini Rao",
      email: "nandini@example-startup.com",
      phone: "+91 98000 11111",
      designation: "Co-founder & CEO",
      organization: "Example Startup (Seed-funded edtech)",
      bio: "Nandini started Example Startup from her college hostel in 2019 and has since raised a seed round. She mentors student founders on validating ideas and building early teams.",
      photoUrl: "https://example.com/guests/nandini.jpg",
      linkedinUrl: "https://www.linkedin.com/in/example-nandini",
      websiteUrl: "https://example-startup.com",
      city: "Bengaluru",
      expertise: ["Startups", "Fundraising", "EdTech"],
      notes: "Prefers morning sessions. Spoke at our 2025 orientation; very well received.",
    },
  });
  const investor = await prisma.guestProfile.create({
    data: {
      tenantId: sun.id,
      name: "Rahul Kapoor",
      email: "rahul@example-ventures.com",
      designation: "Partner",
      organization: "Example Ventures",
      bio: "Rahul invests in early-stage consumer and SaaS companies and has backed over 30 startups.",
      linkedinUrl: "https://www.linkedin.com/in/example-rahul",
      city: "Mumbai",
      expertise: ["Venture capital", "SaaS"],
    },
  });
  const ffStart = days(12);
  const fireside = await prisma.event.create({
    data: {
      tenantId: sun.id,
      slug: "founders-fireside-campus-to-funded",
      title: "Founders' Fireside: From campus idea to funded startup",
      tagline: "A founder and an investor on what it really takes to start up while in college",
      description:
        "An evening conversation with a founder who started up from her hostel room and an early-stage investor. " +
        "Learn how to validate an idea, find co-founders, and what investors look for — followed by open Q&A and networking.",
      type: "ENTREPRENEURSHIP",
      scope: "CENTRAL",
      mode: "HYBRID",
      status: "REGISTRATION_OPEN",
      venue: "Sunstone @ Mumbai, Auditorium",
      venueMapUrl: "https://maps.google.com/?q=Mumbai",
      meetingUrl: "https://meet.example.com/founders-fireside",
      livestreamUrl: "https://youtube.com/@example/live",
      contactEmail: "events@sunstone.in",
      contactPhone: "+91 90000 00000",
      startsAt: ffStart,
      endsAt: new Date(ffStart.getTime() + 2 * 60 * 60 * 1000),
      registrationOpensAt: days(-3),
      registrationClosesAt: days(11),
      capacity: 150,
      modules: { ...DEFAULT_MODULES.ENTREPRENEURSHIP },
      faqs: [
        { q: "Who can attend?", a: "All Sunstone students. Online attendees get the joining link after registering." },
        { q: "Will there be a certificate?", a: "Yes — everyone who checks in gets a participation certificate." },
        { q: "Can I pitch my idea?", a: "Yes, there is a 20-minute open Q&A and networking slot at the end." },
      ],
      registrationForm: [
        { id: "idea", label: "Do you have a startup idea? (one line)", type: "text", required: false },
        { id: "mode", label: "How will you attend?", type: "select", required: true, options: ["In person", "Online"] },
      ],
      createdById: sunAdmin.id,
      staff: { create: [{ userId: sunAdmin.id, role: "MANAGER" }] },
      tasks: { create: checklist("ENTREPRENEURSHIP", ffStart, days(0)) },
      sponsors: {
        create: [
          { name: "Example Incubator", tier: "TITLE", website: "https://incubator.example.com", logoUrl: "https://example.com/logos/incubator.png", sortOrder: 0 },
          { name: "Example Bank", tier: "PARTNER", website: "https://bank.example.com", sortOrder: 1 },
        ],
      },
      sessions: {
        create: [
          { title: "Fireside chat: campus to funded", speaker: "Nandini Rao, Rahul Kapoor", startsAt: ffStart, endsAt: new Date(ffStart.getTime() + 75 * 60 * 1000) },
          { title: "Open Q&A and networking", startsAt: new Date(ffStart.getTime() + 75 * 60 * 1000), endsAt: new Date(ffStart.getTime() + 2 * 60 * 60 * 1000) },
        ],
      },
      guests: {
        create: [
          {
            profileId: founder.id, name: founder.name, email: founder.email, phone: founder.phone, designation: founder.designation,
            organization: founder.organization, bio: founder.bio, photoUrl: founder.photoUrl, linkedinUrl: founder.linkedinUrl,
            role: "SPEAKER", status: "CONFIRMED", talkTitle: "From hostel room to seed round",
            talkAbstract: "The first 18 months of a student startup: finding the problem, the first 100 users and the first cheque.",
            sessionAt: ffStart, hostUserId: sunAdmin.id, arrivalAt: new Date(ffStart.getTime() - 3 * 60 * 60 * 1000),
            departureAt: new Date(ffStart.getTime() + 4 * 60 * 60 * 1000), travelNotes: "Flight BLR→BOM, arrives 1:30 pm. Pickup arranged.",
            stayDetails: "Not required (same-day return)", dietary: "Vegetarian", avRequirements: "Lapel mic, HDMI for laptop",
            consentRecording: true, honorarium: 15000, paymentStatus: "PENDING", invitedAt: days(-10), profileSubmittedAt: days(-6),
            documents: [{ name: "Talk outline", url: "https://example.com/docs/nandini-outline.pdf", kind: "PRESENTATION" }],
            sortOrder: 0,
          },
          {
            profileId: investor.id, name: investor.name, email: investor.email, designation: investor.designation,
            organization: investor.organization, bio: investor.bio, linkedinUrl: investor.linkedinUrl,
            role: "INVESTOR", status: "INVITED", talkTitle: "What investors look for in student founders",
            sessionAt: ffStart, hostUserId: sunAdmin.id, consentRecording: null, paymentStatus: "NOT_APPLICABLE", invitedAt: days(-4),
            sortOrder: 1,
          },
        ],
      },
    },
  });
  for (const userId of students.sunstone.slice(0, 8)) {
    await prisma.registration.create({
      data: { eventId: fireside.id, userId, status: "APPROVED", answers: { mode: userId.length % 2 ? "In person" : "Online" } },
    });
  }
  await prisma.eventActivity.create({ data: { eventId: fireside.id, actorId: sunAdmin.id, action: "event.created", data: { title: fireside.title } } });

  // The guest library is reused across events: the founder also mentors at the PM guest lecture.
  const pmLecture = await prisma.event.findFirstOrThrow({ where: { tenantId: sun.id, slug: "guest-lecture-product-management" } });
  await prisma.eventGuest.create({
    data: {
      eventId: pmLecture.id, profileId: founder.id, name: founder.name, email: founder.email, designation: founder.designation,
      organization: founder.organization, bio: founder.bio, linkedinUrl: founder.linkedinUrl, role: "PANELIST", status: "PROPOSED",
    },
  });
  // Each brand keeps its own library: Alta has the GenAI workshop speaker on file too.
  const altaWorkshop = await prisma.event.findFirstOrThrow({ where: { tenantId: alta.id, slug: "intro-to-genai-workshop" }, include: { guests: true } });
  const ankit = await prisma.guestProfile.create({
    data: { tenantId: alta.id, name: "Ankit Bose", email: "ankit@example.com", designation: "ML Engineer", organization: "Example AI Labs", expertise: ["GenAI", "Python"] },
  });
  await prisma.eventGuest.updateMany({ where: { eventId: altaWorkshop.id, email: "ankit@example.com" }, data: { profileId: ankit.id } });

  // ───────── Alta: paid hackathon open for team registrations (v1.2) ─────────
  const altaAdmin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@altaschool.dev" } });
  const bwStart = days(18);
  const bwEnd = new Date(bwStart.getTime() + 2 * DAY);
  const crit = (name: string) => DEFAULT_CRITERIA_LIBRARY.find((c) => c.name === name)!;
  const sectionHtml: Record<string, string> = {
    Eligibility:
      "<ul><li>Open to all Alta School of Technology students, any year and any campus</li><li>Teams of <strong>2–4</strong> — cross-campus teams are welcome</li><li>Every member needs their own Elevate account (we create it when the leader registers the team)</li></ul>",
    Timeline: [
      "<ul>",
      `<li><strong>Registrations close:</strong> ${new Date(bwStart.getTime() - 2 * DAY).toDateString()}</li>`,
      `<li><strong>Problem statements released:</strong> two now, the sponsor track at kickoff (${bwStart.toDateString()}, 10:00)</li>`,
      `<li><strong>Submission deadline:</strong> ${bwEnd.toDateString()}, 12:00</li>`,
      "<li><strong>First cut:</strong> all teams, judged on the repo and demo video</li>",
      "<li><strong>Final:</strong> top teams pitch live to the jury</li>",
      "</ul>",
    ].join(""),
    Prizes: "<ul><li>🥇 Winner: ₹50,000 + internship interviews with our partners</li><li>🥈 Runner-up: ₹25,000</li><li>🥉 Second runner-up: ₹10,000</li><li>Best first-year team: swag kits and mentorship</li></ul>",
    Rules:
      "<ol><li>All code must be written during the hackathon — boilerplate and open-source libraries are fine.</li><li>Submit a <strong>public GitHub repo</strong> and a demo video of at most 3 minutes.</li><li>Use of AI tools is allowed; say how you used them in your README.</li><li>Be kind. The <a href=\"https://altaschool.tech/code-of-conduct\" target=\"_blank\">code of conduct</a> applies throughout.</li></ol>",
    Judging:
      "<p>Teams are judged in two checks. The <strong>First cut</strong> looks at every submission; the best teams move on to the <strong>Final</strong>, where they also present live.</p><p>Parameters: innovation, problem understanding, technical complexity, working demo and impact — plus presentation in the Final.</p>",
  };
  const buildWeekend = await prisma.event.create({
    data: {
      tenantId: alta.id,
      slug: "alta-build-weekend-2026",
      title: "Alta Build Weekend 2026",
      tagline: "48 hours. Your team. Real problems from real partners.",
      description: [
        "<h2>Build something people actually use</h2>",
        "<p>Alta Build Weekend is our <strong>48-hour product hackathon</strong>. Form a team of 2–4, pick a track and a problem statement, and ship a working prototype by Sunday noon.</p>",
        "<h3>Why join</h3>",
        "<ul><li>Mentors from product companies on call all weekend</li><li>Cloud credits and API keys for every team</li><li>₹85,000 in prizes and internship interviews</li></ul>",
        "<blockquote>Last year's winners turned their project into a startup that now serves 3 colleges.</blockquote>",
        "<p>Bring a laptop and your charger; we bring food, coffee and Wi-Fi. Starter repo: <code>npx create-alta-app</code></p>",
      ].join(""),
      type: "HACKATHON",
      scope: "CENTRAL",
      mode: "HYBRID",
      status: "REGISTRATION_OPEN",
      venue: "Bengaluru Campus, Innovation Hall",
      meetingUrl: "https://meet.example.com/alta-build-weekend",
      contactEmail: "events@altaschool.tech",
      startsAt: bwStart,
      endsAt: bwEnd,
      registrationOpensAt: days(-5),
      registrationClosesAt: days(16),
      capacity: 120,
      modules: { ...DEFAULT_MODULES.HACKATHON },
      config: {
        minTeamSize: 2,
        maxTeamSize: 4,
        teamRegistration: "WITH_TEAM",
        tracks: [
          { id: "ai", name: "AI for good", description: "Use AI to solve a real problem for real people" },
          { id: "fintech", name: "Fintech", description: "Money, payments and financial inclusion" },
          { id: "campus", name: "Campus life", description: "Make student life easier, safer or more fun" },
        ],
        prizes: [{ place: 1, prize: "₹50,000" }, { place: 2, prize: "₹25,000" }, { place: 3, prize: "₹10,000" }],
        judgeComments: ["Great use of the sponsor API", "Think about offline users"],
      },
      pageSections: PAGE_SECTION_TEMPLATES.HACKATHON.map((t, i) => ({
        id: t.title.toLowerCase(),
        title: t.title,
        html: sectionHtml[t.title] ?? t.html,
        icon: ["users", "calendar", "trophy", "scroll", "scale"][i],
      })),
      feeAmount: 49900,
      currency: "INR",
      feeType: "PER_TEAM",
      earlyBirdAmount: 29900,
      earlyBirdEndsAt: days(7),
      submissionsOpenAt: days(-1),
      submissionsCloseAt: days(20),
      faqs: [
        { q: "Is the fee per person?", a: "No — ₹499 per team (₹299 early bird), whatever the team size." },
        { q: "Can I register without a team?", a: "This edition takes team registrations only. Post in the Discord to find teammates." },
      ],
      createdById: altaAdmin.id,
      campuses: { create: alta.campuses.map((c) => ({ campusId: c.id })) },
      staff: { create: [{ userId: altaAdmin.id, role: "MANAGER" }, { userId: volunteer.id, role: "VOLUNTEER" }] },
      tasks: { create: checklist("HACKATHON", bwStart, days(0)) },
      coupons: { create: [{ code: "ALTA50", percentOff: 50, maxUses: 50 }] },
      problemStatements: {
        create: [
          {
            code: "PS-01", trackId: "ai", title: "Smart study planner", difficulty: "Medium", sortOrder: 0,
            html: "<p>Students juggle classes, assignments and exams across apps. Build an assistant that turns a syllabus and deadlines into a realistic weekly plan, and adapts when things slip.</p><ul><li>Import deadlines from a calendar or PDF</li><li>Explain <em>why</em> it scheduled something</li></ul>",
            attachments: [{ label: "Sample syllabus (PDF)", url: "https://example.com/ps/syllabus.pdf" }],
          },
          {
            code: "PS-02", trackId: "fintech", title: "Split it fairly", difficulty: "Easy", sortOrder: 1,
            html: "<p>Hostel roommates share rent, food and trips. Design a UPI-friendly way to track and settle shared expenses with the fewest transfers.</p>",
          },
          {
            code: "PS-03", trackId: "campus", title: "Sponsor challenge: campus safety", difficulty: "Hard", sponsorName: "Example Labs", sortOrder: 2,
            html: "<p>Revealed at kickoff.</p>", releaseAt: new Date(bwStart.getTime() + 10 * 60 * 60 * 1000),
          },
        ],
      },
    },
    include: { problemStatements: true },
  });
  const [firstCut, finalRound] = [
    await prisma.judgingRound.create({ data: { eventId: buildWeekend.id, name: "First cut", sortOrder: 0, restrictTeams: false, description: "Every submission, judged on the repo and the demo video." } }),
    await prisma.judgingRound.create({ data: { eventId: buildWeekend.id, name: "Final", sortOrder: 1, restrictTeams: true, shareFeedback: true, description: "Shortlisted teams pitch live (5 min + 3 min Q&A)." } }),
  ];
  const eventWide = ["Innovation", "Problem understanding", "Technical complexity", "Working demo", "Impact"].map(crit);
  await prisma.rubricCriterion.createMany({
    data: [
      ...eventWide.map((c, i) => ({ eventId: buildWeekend.id, name: c.name, description: c.description, maxScore: c.maxScore, weight: c.weight, sortOrder: i })),
      { eventId: buildWeekend.id, roundId: finalRound.id, name: crit("Presentation").name, description: crit("Presentation").description, maxScore: 10, weight: 1, sortOrder: 5 },
    ],
  });
  await prisma.judgeAssignment.create({ data: { eventId: buildWeekend.id, userId: judge.id } });

  const ps = buildWeekend.problemStatements;
  const bwTeams = [
    { name: "Pixel Pirates", track: "ai", ps: ps[0].id, members: altaStudents.slice(0, 3), title: "PlanPal", stack: ["Next.js", "FastAPI", "OpenAI"], provider: "DEV" as const, amount: 29900 },
    { name: "Quantum Quokkas", track: "fintech", ps: ps[1].id, members: altaStudents.slice(3, 5), title: "SplitSmart", stack: ["Flutter", "Firebase"], provider: "MANUAL" as const, amount: 29900 },
  ];
  for (const [i, d] of bwTeams.entries()) {
    const slug = d.title.toLowerCase();
    const team = await prisma.team.create({
      data: {
        eventId: buildWeekend.id, name: d.name, trackId: d.track, problemStatementId: d.ps, inviteCode: teamInviteCode(), registeredAsTeam: true,
        projectTitle: d.title, projectSummary: `${d.title} — a ${d.stack.join(" + ")} prototype built for ${buildWeekend.title}.`,
        repoUrl: `https://github.com/example/${slug}`, demoUrl: `https://${slug}.example.com`, videoUrl: `https://youtube.com/watch?v=${slug}`,
        techStack: d.stack,
        attachments: [{ label: "Pitch deck", url: `https://example.com/decks/${slug}.pdf`, kind: "link" }],
        submittedAt: i === 0 ? days(-0.5) : null,
        members: { create: d.members.map((userId, j) => ({ userId, isLeader: j === 0 })) },
      },
    });
    const payment = await prisma.payment.create({
      data: {
        eventId: buildWeekend.id, userId: d.members[0], teamId: team.id, provider: d.provider, status: "PAID", amount: d.amount, currency: "INR",
        quantity: 1, receiptNo: `ELV-2026-${String(100 + i).padStart(6, "0")}`, paidAt: days(-2 + i),
        providerOrderId: d.provider === "DEV" ? `order_dev_seed${i}` : null, providerPaymentId: d.provider === "DEV" ? `pay_dev_seed${i}` : null,
        notes: d.provider === "MANUAL" ? "Bank transfer, UTR 4211 0098 7765" : null,
      },
    });
    for (const [j, userId] of d.members.entries()) {
      await prisma.registration.create({
        data: { eventId: buildWeekend.id, userId, status: "APPROVED", paymentId: payment.id, addedById: j === 0 ? null : d.members[0] },
      });
    }
  }

  // ───────── Alta: tech fest umbrella with sub-events ─────────
  const festStart = days(17);
  const fest = await prisma.event.create({
    data: {
      tenantId: alta.id,
      slug: "alta-techfest-2026",
      title: "Alta TechFest 2026",
      tagline: "Three days of building, learning and showing off",
      description: "<p>Our annual tech fest brings together the <strong>Build Weekend hackathon</strong>, hands-on workshops and talks from industry. Register for each event separately below.</p>",
      type: "TECH_FEST",
      scope: "CENTRAL",
      mode: "OFFLINE",
      status: "ANNOUNCED",
      venue: "Bengaluru Campus",
      startsAt: festStart,
      endsAt: new Date(festStart.getTime() + 3 * DAY),
      modules: { ...DEFAULT_MODULES.TECH_FEST },
      pageSections: [
        { id: "highlights", title: "Highlights", html: "<ul><li>48-hour Build Weekend hackathon</li><li>GenAI and cloud workshops</li><li>Startup expo and demo day</li></ul>", icon: "sparkles" },
        { id: "schedule", title: "Schedule", html: "<p><strong>Day 1:</strong> Opening keynote, workshops</p><p><strong>Day 2–3:</strong> Build Weekend, demo day and prizes</p>", icon: "calendar" },
        { id: "prizes", title: "Prizes", html: "<p>Over ₹1,00,000 in prizes across the fest.</p>", icon: "trophy" },
      ],
      createdById: altaAdmin.id,
      campuses: { create: alta.campuses.map((c) => ({ campusId: c.id })) },
      staff: { create: [{ userId: altaAdmin.id, role: "MANAGER" }] },
      tasks: { create: checklist("TECH_FEST", festStart, days(0)) },
    },
  });
  await prisma.event.updateMany({ where: { tenantId: alta.id, slug: { in: ["alta-build-weekend-2026", "intro-to-genai-workshop"] } }, data: { parentEventId: fest.id } });

  // ───────── Alta: last year's hackathon, completed with published results ─────────
  const pastStart = days(-120);
  const past = await prisma.event.create({
    data: {
      tenantId: alta.id,
      slug: "alta-hacks-2025",
      title: "Alta Hacks 2025",
      tagline: "Where it all started",
      description: "<p>The first inter-campus Alta hackathon: 9 teams, 36 hours, one auditorium.</p>",
      type: "HACKATHON",
      scope: "CENTRAL",
      mode: "OFFLINE",
      status: "COMPLETED",
      venue: "Bengaluru Campus, Main Auditorium",
      startsAt: pastStart,
      endsAt: new Date(pastStart.getTime() + 1.5 * DAY),
      registrationOpensAt: days(-150),
      registrationClosesAt: days(-122),
      modules: { ...DEFAULT_MODULES.HACKATHON },
      config: { minTeamSize: 2, maxTeamSize: 4, tracks: [{ id: "open", name: "Open innovation" }] },
      resultsPublishedAt: new Date(pastStart.getTime() + 2 * DAY),
      createdById: altaAdmin.id,
      campuses: { create: alta.campuses.map((c) => ({ campusId: c.id })) },
      tasks: { create: checklist("HACKATHON", pastStart, days(0)) },
      rubric: { create: ["Innovation", "Working demo", "Impact", "Presentation"].map((n, i) => ({ ...(({ category: _c, ...c }) => c)(crit(n)), sortOrder: i })) },
      rounds: { create: [{ name: "First cut", sortOrder: 0, closedAt: new Date(pastStart.getTime() + 1.2 * DAY) }, { name: "Final", sortOrder: 1, restrictTeams: true, closedAt: new Date(pastStart.getTime() + 1.5 * DAY) }] },
    },
    include: { rounds: true, rubric: true },
  });
  const pastTeams = [
    { name: "Debug Thugs", title: "MediQueue", award: "WINNER", rank: 1, members: altaStudents.slice(5, 8) },
    { name: "Ctrl Alt Elite", title: "FarmFresh", award: "RUNNER_UP", rank: 2, members: altaStudents.slice(8, 11) },
    { name: "Semicolon Squad", title: "BusBuddy", award: null, rank: null, members: altaStudents.slice(11, 14) },
  ];
  const pastFinal = past.rounds.find((r) => r.name === "Final")!;
  const pastFirst = past.rounds.find((r) => r.name === "First cut")!;
  for (const [i, d] of pastTeams.entries()) {
    const team = await prisma.team.create({
      data: {
        eventId: past.id, name: d.name, trackId: "open", inviteCode: teamInviteCode(), projectTitle: d.title,
        projectSummary: `${d.title} — built at Alta Hacks 2025.`, repoUrl: `https://github.com/example/${d.title.toLowerCase()}`,
        submittedAt: new Date(pastStart.getTime() + DAY), award: d.award, rank: d.rank,
        members: { create: d.members.map((userId, j) => ({ userId, isLeader: j === 0 })) },
      },
    });
    await prisma.roundTeam.create({ data: { roundId: pastFinal.id, teamId: team.id } });
    for (const userId of d.members) {
      await prisma.registration.create({ data: { eventId: past.id, userId, status: "CHECKED_IN", checkedInAt: pastStart, checkedInById: volunteer.id } });
    }
    for (const c of past.rubric) {
      await prisma.score.create({ data: { roundId: pastFirst.id, teamId: team.id, judgeId: judge.id, criterionId: c.id, value: 9 - i, submittedAt: pastStart } });
    }
    await prisma.judgeReview.create({
      data: { eventId: past.id, roundId: pastFirst.id, teamId: team.id, judgeId: judge.id, comment: i === 0 ? "Polished and genuinely useful." : "Solid build.", tags: ["Strong, working demo"], recommend: i < 2, submittedAt: pastStart },
    });
  }
  await prisma.judgeAssignment.create({ data: { eventId: past.id, userId: judge.id } });
  await generateCertificates(past.id);

  // Unused import guard (serials are generated inside generateCertificates).
  void certificateSerial;

  const counts = {
    tenants: await prisma.tenant.count(),
    users: await prisma.user.count(),
    events: await prisma.event.count(),
    registrations: await prisma.registration.count(),
    certificates: await prisma.certificate.count(),
    linkedinDrafts: await prisma.linkedInPost.count(),
    guestProfiles: await prisma.guestProfile.count(),
    sponsors: await prisma.sponsor.count(),
    payments: await prisma.payment.count(),
    problemStatements: await prisma.problemStatement.count(),
  };
  console.log("Seeded:", counts);
  console.log("Sign in with OTP as admin@elevate.dev (platform admin), admin@altaschool.dev, judge@elevate.dev, volunteer@elevate.dev, student1@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
