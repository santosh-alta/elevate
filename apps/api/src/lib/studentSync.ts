import type { Prisma } from "@prisma/client";
import { prisma } from "../plugins/prisma";
import { HttpError } from "./errors";

/**
 * Student list from the institute's student database, read through Redash (read-only).
 *
 *   REDASH_URL               e.g. https://redash.sunstone.in
 *   REDASH_KEY               Redash API key
 *   REDASH_STUDENT_SOURCES   brand slug → Redash data source id, e.g. "altaschool:9"
 *
 * Active, non-test students with role "student" are imported with campus, program and enrolment year (batch).
 * Students who disappear from the source are marked inactive (never deleted). Campuses are matched to ours by
 * code or name; matched codes are remembered on the campus (externalCodes) and our campus takes the official name.
 */
const SQL = `SELECT u.id AS id, u.name AS name, u.email AS email, u.mobile AS phone,
  u.admission_year AS batch, u.passing_year AS passing_year,
  c.campus_name AS campus_code, c.campus_fullname AS campus_name, c.campus_city AS campus_city,
  p.name AS program
FROM users u
LEFT JOIN campus c ON c.id = u.campus_id
LEFT JOIN programs p ON p.id = u.program
WHERE u.role = 'student' AND u.status = '1' AND u.isTestingUser = '0'`;

/**
 * ALTA instructors: an active staff account with an @altaschool.tech or @sunstone.in email, currently assigned to
 * teach a section (2023 batch onward) at a campus with ALTA students. University faculty and everyone else are left out.
 */
const FACULTY_SQL = `SELECT f.id AS id,
  TRIM(CONCAT_WS(' ', f.first_name, NULLIF(f.middle_name, ''), f.last_name)) AS name,
  LOWER(pu.email) AS email, f.phone AS phone, d.designation AS designation, f.contract_type AS contract_type, f.bio AS bio,
  GROUP_CONCAT(DISTINCT c.campus_name ORDER BY c.campus_name) AS campuses,
  (SELECT GROUP_CONCAT(DISTINCT e.name ORDER BY e.name) FROM faculty_expertise_mapping fem JOIN expertise e ON e.id = fem.expertise_id WHERE fem.faculty_id = f.id AND fem.status = '1') AS expertise
FROM faculty f
JOIN panel_users pu ON pu.id = f.panel_user_id
JOIN panel_user_subject_section_map m ON m.panel_user_id = f.panel_user_id AND m.status = '1'
JOIN sections s ON s.id = m.section_id
JOIN campus c ON c.id = s.campus_id
LEFT JOIN panel_designations d ON d.id = f.designation_id
WHERE f.status = '1' AND pu.email NOT LIKE '%\\_deleted\\_%'
  AND (pu.email LIKE '%@altaschool.tech' OR pu.email LIKE '%@sunstone.in')
  AND s.admission_year >= 2023
  AND s.campus_id IN (SELECT DISTINCT campus_id FROM users WHERE role = 'student' AND status = '1' AND isTestingUser = '0')
GROUP BY f.id, name, email, f.phone, d.designation, f.contract_type, f.bio`;

type FacultyRow = {
  id: number | string; name: string | null; email: string | null; phone: string | null; designation: string | null;
  contract_type: string | null; bio: string | null; campuses: string | null; expertise: string | null;
};

type Row = {
  id: number | string; name: string | null; email: string | null; phone: string | null;
  batch: number | string | null; passing_year: number | string | null;
  campus_code: string | null; campus_name: string | null; campus_city: string | null; program: string | null;
};

export function studentSourceFor(slug: string): number | null {
  const map = (process.env.REDASH_STUDENT_SOURCES ?? "").split(",").map((x) => x.trim().split(":"));
  const hit = map.find(([s]) => s === slug);
  return hit && Number(hit[1]) ? Number(hit[1]) : null;
}

async function redash<T>(path: string, body?: unknown): Promise<T> {
  const base = process.env.REDASH_URL?.replace(/\/$/, "");
  const key = process.env.REDASH_KEY;
  if (!base || !key) throw new HttpError(503, "not_configured", "The student database isn't connected (REDASH_URL / REDASH_KEY)");
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new HttpError(502, "redash_error", `Student database returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Runs a read-only SQL query on a Redash data source and returns the rows. */
async function runQuery<R = Row>(dataSourceId: number, sql: string): Promise<R[]> {
  type Result = { query_result?: { data: { rows: R[] } }; job?: { id: string; status: number; error?: string; query_result_id?: number } };
  let r = await redash<Result>("/api/query_results", { data_source_id: dataSourceId, query: sql, max_age: 0 });
  if (r.job) {
    let job = r.job;
    for (let i = 0; i < 150 && job.status !== 3 && job.status !== 4; i++) {
      await new Promise((ok) => setTimeout(ok, 2000));
      job = (await redash<{ job: typeof job }>(`/api/jobs/${job.id}`)).job;
    }
    if (job.status !== 3 || !job.query_result_id) throw new HttpError(502, "redash_error", `Student query didn't finish: ${job.error ?? "timeout"}`);
    r = await redash<Result>(`/api/query_results/${job.query_result_id}`);
  }
  return r.query_result?.data.rows ?? [];
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const firstTwo = (s: string) => norm(s).split(" ").slice(0, 2).join(" ");
const int = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 1990 && n < 2100 ? n : null;
};

export type SyncResult = {
  imported: number; updated: number; deactivated: number; total: number; faculty: number;
  matchedCampuses: { code: string; campus: string }[]; unmatched: { code: string; name: string; students: number }[];
  finishedAt: string;
};

export async function syncStudents(tenantId: string): Promise<SyncResult> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const ds = studentSourceFor(tenant.slug);
  if (!ds) throw new HttpError(503, "not_configured", "No student database is set up for this brand");
  const source = `redash:${ds}`;
  const rows = (await runQuery(ds, SQL)).filter((r) => r.id != null && r.name);

  // Match the source's campus codes to our campuses.
  const campuses = await prisma.campus.findMany({ where: { tenantId } });
  const codes = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    if (!r.campus_code) continue;
    const c = codes.get(r.campus_code) ?? { name: (r.campus_name ?? r.campus_code).trim(), count: 0 };
    c.count++;
    codes.set(r.campus_code, c);
  }
  const campusFor = new Map<string, string>();
  const matched: SyncResult["matchedCampuses"] = [];
  const unmatched: SyncResult["unmatched"] = [];
  for (const [code, info] of codes) {
    const hit =
      campuses.find((c) => c.externalCodes.includes(code)) ??
      campuses.find((c) => c.code.toUpperCase() === code.toUpperCase()) ??
      campuses.find((c) => firstTwo(c.name) && firstTwo(c.name) === firstTwo(info.name));
    if (hit) {
      campusFor.set(code, hit.id);
      matched.push({ code, campus: hit.name });
      if (!hit.externalCodes.includes(code)) {
        hit.externalCodes.push(code);
        await prisma.campus.update({ where: { id: hit.id }, data: { externalCodes: hit.externalCodes } });
      }
    } else unmatched.push({ code, name: info.name, students: info.count });
  }
  // Our campus takes the official name from its main code (same code, or the biggest matched one).
  for (const c of campuses) {
    const own = [...codes.entries()].filter(([code]) => campusFor.get(code) === c.id).sort((a, b) => (a[0] === c.code ? -1 : b[0] === c.code ? 1 : b[1].count - a[1].count))[0];
    if (own && own[1].name && norm(own[1].name) !== norm(c.name)) {
      await prisma.campus.update({ where: { id: c.id }, data: { name: own[1].name } });
    }
  }

  const existing = new Map((await prisma.student.findMany({ where: { tenantId, source }, select: { id: true, externalId: true } })).map((s) => [s.externalId, s.id]));
  const users = new Map((await prisma.user.findMany({ where: { email: { in: rows.map((r) => r.email?.toLowerCase().trim()).filter((e): e is string => !!e) } }, select: { id: true, email: true } })).map((u) => [u.email, u.id]));
  const now = new Date();
  let imported = 0;
  let updated = 0;
  const seen = new Set<string>();
  const toCreate: Prisma.StudentCreateManyInput[] = [];
  const toUpdate: { id: string; data: Prisma.StudentUpdateInput }[] = [];
  for (const r of rows) {
    const externalId = String(r.id);
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const email = r.email?.toLowerCase().trim() || null;
    const fields = {
      name: r.name!.trim(), email, phone: r.phone?.trim() || null,
      campusCode: r.campus_code, campusName: r.campus_name?.trim() || null, campusId: r.campus_code ? campusFor.get(r.campus_code) ?? null : null,
      program: r.program?.trim() || null, batch: int(r.batch), passingYear: int(r.passing_year),
      active: true, userId: email ? users.get(email) ?? null : null, syncedAt: now,
    };
    const id = existing.get(externalId);
    if (id) {
      const { campusId, ...rest } = fields;
      toUpdate.push({ id, data: { ...rest, campus: campusId ? { connect: { id: campusId } } : { disconnect: true } } });
      updated++;
    } else {
      toCreate.push({ tenantId, source, externalId, ...fields });
      imported++;
    }
  }
  for (let i = 0; i < toCreate.length; i += 500) await prisma.student.createMany({ data: toCreate.slice(i, i + 500), skipDuplicates: true });
  for (let i = 0; i < toUpdate.length; i += 100) {
    await prisma.$transaction(toUpdate.slice(i, i + 100).map((u) => prisma.student.update({ where: { id: u.id }, data: u.data })));
  }
  const gone = [...existing.keys()].filter((x) => !seen.has(x));
  const deactivated = gone.length
    ? (await prisma.student.updateMany({ where: { tenantId, source, externalId: { in: gone }, active: true }, data: { active: false } })).count
    : 0;

  let faculty = 0;
  try {
    faculty = await syncFaculty(tenantId, tenant.name, ds, now);
  } catch (e) {
    console.warn("[faculty] sync failed", e);
  }
  const result: SyncResult = { imported, updated, deactivated, total: seen.size, faculty, matchedCampuses: matched, unmatched, finishedAt: now.toISOString() };
  const fresh = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { ...((fresh.settings ?? {}) as object), studentSync: { lastSyncAt: result.finishedAt, total: result.total, faculty: result.faculty, unmatched } } as Prisma.InputJsonValue },
  });
  return result;
}

const lastAttempt = new Map<string, number>();

/** Monthly refresh, called by the worker. After a failure it waits an hour before trying again. */
export async function syncStudentsIfDue(): Promise<void> {
  if (!process.env.REDASH_URL || !process.env.REDASH_KEY) return;
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true, settings: true } });
  for (const t of tenants) {
    if (!studentSourceFor(t.slug)) continue;
    const last = ((t.settings ?? {}) as { studentSync?: { lastSyncAt?: string } }).studentSync?.lastSyncAt;
    if (last && Date.now() - new Date(last).getTime() < 30 * 86_400_000) continue;
    if (Date.now() - (lastAttempt.get(t.id) ?? 0) < 3_600_000) continue;
    lastAttempt.set(t.id, Date.now());
    try {
      const r = await syncStudents(t.id);
      console.info(`[students] ${t.slug}: ${r.total} students (${r.imported} new, ${r.deactivated} inactive)`);
    } catch (e) {
      console.warn(`[students] ${t.slug} sync failed`, e);
    }
  }
}

/**
 * Puts ALTA instructors into the guest directory, tagged ALTA, so they can be picked as speakers, mentors or judges.
 * One profile per email (people with several faculty records are merged). Details they or the team filled in
 * (bio, photo, links) are never overwritten. Instructors who stop teaching are marked inactive.
 */
async function syncFaculty(tenantId: string, org: string, ds: number, now: Date): Promise<number> {
  const rows = await runQuery<FacultyRow>(ds, FACULTY_SQL);
  const source = `redash:${ds}:faculty`;
  const people = new Map<string, { name: string; phone: string | null; designation: string | null; contract: string | null; bio: string | null; campuses: Set<string>; expertise: Set<string> }>();
  for (const r of rows) {
    const email = r.email?.toLowerCase().trim();
    if (!email || !r.name) continue;
    const p = people.get(email) ?? { name: r.name.trim(), phone: null, designation: null, contract: null, bio: null, campuses: new Set<string>(), expertise: new Set<string>() };
    p.phone ??= r.phone?.trim() || null;
    p.designation ??= r.designation?.trim() || null;
    p.contract ??= r.contract_type || null;
    p.bio ??= r.bio?.trim() || null;
    (r.campuses ?? "").split(",").map((x) => x.trim()).filter(Boolean).forEach((x) => p.campuses.add(x));
    (r.expertise ?? "").split(",").map((x) => x.trim()).filter(Boolean).forEach((x) => p.expertise.add(x));
    people.set(email, p);
  }
  const existing = await prisma.guestProfile.findMany({ where: { tenantId, OR: [{ source }, { email: { in: [...people.keys()] } }] } });
  const bySource = new Map(existing.filter((g) => g.source === source && g.externalId).map((g) => [g.externalId!, g]));
  const byEmail = new Map(existing.filter((g) => g.email).map((g) => [g.email!.toLowerCase(), g]));
  for (const [email, p] of people) {
    const g = bySource.get(email) ?? byEmail.get(email);
    const synced = {
      affiliation: "ALTA", source, externalId: email, active: true,
      campuses: [...p.campuses].sort(), contractType: p.contract, expertise: [...p.expertise].slice(0, 20),
    };
    if (g) {
      await prisma.guestProfile.update({
        where: { id: g.id },
        data: {
          ...synced,
          ...(!g.name && { name: p.name }), ...(!g.email && { email }), ...(!g.phone && p.phone && { phone: p.phone }),
          ...(!g.designation && p.designation && { designation: p.designation }), ...(!g.organization && { organization: org }),
          ...(!g.bio && p.bio && { bio: p.bio }),
        },
      });
    } else {
      await prisma.guestProfile.create({
        data: { tenantId, ...synced, name: p.name, email, phone: p.phone, designation: p.designation, organization: org, bio: p.bio },
      });
    }
  }
  await prisma.guestProfile.updateMany({ where: { tenantId, source, externalId: { notIn: [...people.keys()] }, active: true }, data: { active: false } });
  void now;
  return people.size;
}
