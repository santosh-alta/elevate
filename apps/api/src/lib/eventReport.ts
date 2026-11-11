import { PDFDocument, rgb, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import sharp from "sharp";
import { EVENT_TYPE_LABELS, WORK_TEAM_LABELS } from "@elevate/shared";
import { prisma } from "../plugins/prisma";
import { brandBaseUrl, themeOf } from "./brand";
import { drawGradientBar, embedBrandImage, embedFonts, hexToRgb, shade, type PdfFont } from "./brandAssets";
import { buildOutcome } from "./outcome";
import type { OutcomeSummary } from "./outcomeSummary";

/**
 * One-click event report (A4 PDF) for founders and leadership: what happened, the numbers, results, feedback,
 * photos, social posts, money, and who did what. Built fresh from the database each time.
 */

const W = 595.28;
const H = 841.89;
const M = 44; // page margin
const TZ = process.env.DISPLAY_TZ || "Asia/Kolkata";

const day = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }) : "";
const when = (a: Date, b: Date) => {
  const s = day(a);
  const e = day(b);
  const t = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  return s === e ? `${s}, ${t(a)}–${t(b)}` : `${s} – ${e}`;
};
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const human = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

type Outcome = {
  registrations: { registered: number; attended: number; attendanceRate: number; byStatus: Record<string, number>; byCampus: { campus: string; count: number }[] };
  teams: { total: number; participants: number; submitted: number; winners: { team: string; award: string | null; rank: number | null }[]; leaderboard: { team: { name: string; projectTitle: string | null }; total: number }[] };
  guests: { name: string; designation: string | null; organization: string | null; status: string }[];
  feedback: { responses: number; avgRating: number | null; avgNps: number | null };
  media: { driveFolderUrl: string | null; items: number; byKind: Record<string, number> };
  social: { planned: number; posted: number; posts: { platform: string; status: string; url: string | null }[] };
  certificates: { issued: number; byType: Record<string, number> };
  linkedin: { drafts: number; posted: number };
  budget: { planned: number; actual: number };
  revenue: { paid: number; refunded: number; pending: number; count: number };
  tasks: { total: number; done: number };
  aiSummary?: OutcomeSummary;
};

/** Smaller copies of Cloudinary photos so the PDF stays light. Other hosts are used as they are. */
function thumb(url: string): string {
  return url.includes("res.cloudinary.com") && url.includes("/upload/") ? url.replace("/upload/", "/upload/w_520,h_360,c_fill,q_70,f_jpg/") : url;
}

async function fetchImage(doc: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    // Any format (WebP, PNG, JPEG…) → small JPEG, cropped to the tile shape, so the PDF stays light.
    const jpg = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(520, 354, { fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
    return await doc.embedJpg(jpg);
  } catch { /* skip this photo */ }
  return null;
}

export async function renderEventReportPdf(eventId: string, opts: { save?: boolean } = {}): Promise<{ pdf: Uint8Array; filename: string }> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      tenant: true, category: { select: { name: true } }, owner: { select: { name: true } },
      campuses: { select: { campus: { select: { name: true } } } },
    },
  });
  const outcome = (await buildOutcome(eventId, opts)) as unknown as Outcome;
  const [tasks, comments, photos, highlights] = await Promise.all([
    prisma.eventTask.findMany({ where: { eventId }, orderBy: [{ phase: "asc" }, { sortOrder: "asc" }], include: { assignee: { select: { name: true } } } }),
    prisma.feedback.findMany({ where: { eventId, comment: { not: null } }, orderBy: { rating: "desc" }, take: 8, select: { rating: true, comment: true } }),
    prisma.mediaAsset.findMany({ where: { eventId, kind: "PHOTO" }, orderBy: [{ isHighlight: "desc" }, { createdAt: "asc" }], take: 6, select: { url: true } }),
    prisma.socialPost.count({ where: { eventId, featured: true } }),
  ]);

  const tenant = event.tenant;
  const theme = themeOf(tenant);
  const c = theme.colors;
  const heroBg = hexToRgb(c.heroBg);
  const heroFg = hexToRgb(c.heroFg, rgb(1, 1, 1));
  const primary = hexToRgb(c.primary);
  const accent = hexToRgb(c.accent);
  const ink = hexToRgb(c.fg, rgb(0.06, 0.09, 0.16));
  const muted = hexToRgb(c.muted, rgb(0.42, 0.45, 0.52));
  const line = hexToRgb(c.border, rgb(0.88, 0.9, 0.93));
  const soft = shade(primary, 0.93);
  const [g1, g2] = (theme.gradient ?? [c.primary, c.accent]).map((x) => hexToRgb(x));

  const doc = await PDFDocument.create();
  doc.setTitle(`Event report: ${event.title}`);
  doc.setAuthor(tenant.name);
  doc.setCreator(tenant.name);
  doc.setProducer(tenant.name);
  const fonts = await embedFonts(doc);

  const blank = () => {
    const p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) }); // explicit white, for every PDF viewer
    return p;
  };
  let page: PDFPage = blank();
  let y = H - M;

  const text = (t: string, x: number, yy: number, size: number, f: PdfFont, color: RGB, opacity = 1) => {
    const p = f.pick(t);
    page.drawText(p.text, { x, y: yy, size, font: p.font, color, opacity });
  };
  const width = (t: string, f: PdfFont, size: number) => f.width(t, size);
  const wrap = (t: string, f: PdfFont, size: number, max: number): string[] => {
    const out: string[] = [];
    for (const para of t.split("\n")) {
      let cur = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (width(next, f, size) <= max) cur = next;
        else {
          if (cur) out.push(cur);
          cur = word;
          while (width(cur, f, size) > max && cur.length > 4) {
            let cut = cur.length - 1;
            while (cut > 1 && width(cur.slice(0, cut), f, size) > max) cut--;
            out.push(cur.slice(0, cut));
            cur = cur.slice(cut);
          }
        }
      }
      out.push(cur);
    }
    return out;
  };
  const clip = (t: string, f: PdfFont, size: number, max: number) => {
    if (width(t, f, size) <= max) return t;
    let s = t;
    while (s.length > 1 && width(`${s}…`, f, size) > max) s = s.slice(0, -1);
    return `${s}…`;
  };

  const newPage = () => {
    page = blank();
    drawGradientBar(page, 0, H - 6, W, 6, g1, g2);
    y = H - M - 6;
  };
  const need = (h: number) => {
    if (y - h < M + 30) newPage();
  };
  const section = (title: string, sub?: string) => {
    need(70);
    y -= 14;
    text(title, M, y, 15, fonts.sansBold, ink);
    page.drawRectangle({ x: M, y: y - 8, width: 28, height: 2.5, color: accent });
    if (sub) text(sub, M + width(title, fonts.sansBold, 15) + 10, y + 1, 9, fonts.sans, muted);
    y -= 26;
  };
  const para = (t: string, size = 10, color = ink, f = fonts.sans, indent = 0, max = W - 2 * M) => {
    for (const l of wrap(t, f, size, max - indent)) {
      need(size + 6);
      text(l, M + indent, y, size, f, color);
      y -= size + 4.5;
    }
  };
  const bullets = (items: string[], color: RGB, x0 = M, max = W - 2 * M) => {
    for (const it of items) {
      const lines = wrap(it, fonts.sans, 9.5, max - 14);
      need(lines.length * 13 + 2);
      page.drawCircle({ x: x0 + 4, y: y + 3, size: 1.8, color });
      lines.forEach((l, i) => text(l, x0 + 14, y - i * 13, 9.5, fonts.sans, ink));
      y -= lines.length * 13 + 3;
    }
  };
  const bars = (rows: { label: string; value: number }[], color: RGB, max = W - 2 * M) => {
    const top = Math.max(1, ...rows.map((r) => r.value));
    const labelW = 150;
    for (const r of rows) {
      need(18);
      text(clip(r.label, fonts.sans, 9.5, labelW - 8), M, y, 9.5, fonts.sans, ink);
      const bw = Math.max(2, ((max - labelW - 50) * r.value) / top);
      page.drawRectangle({ x: M + labelW, y: y - 2, width: max - labelW - 50, height: 10, color: soft });
      page.drawRectangle({ x: M + labelW, y: y - 2, width: bw, height: 10, color });
      text(r.value.toLocaleString("en-IN"), M + labelW + bw + 6, y, 9, fonts.sansSemi, ink);
      y -= 17;
    }
  };
  const table = (cols: { label: string; w: number }[], rows: string[][]) => {
    const head = () => {
      need(40);
      page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: soft });
      let x = M + 6;
      for (const col of cols) {
        text(col.label.toUpperCase(), x, y, 7.5, fonts.sansBold, muted);
        x += col.w;
      }
      y -= 22;
    };
    head();
    rows.forEach((r, ri) => {
      if (y - 16 < M + 30) { newPage(); head(); }
      let x = M + 6;
      r.forEach((cell, i) => {
        text(clip(cell, i === 0 ? fonts.sansSemi : fonts.sans, 8.5, cols[i].w - 8), x, y, 8.5, i === 0 ? fonts.sansSemi : fonts.sans, i === 0 ? ink : shade(ink, 0.15));
        x += cols[i].w;
      });
      if (ri < rows.length - 1) page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.4, color: line });
      y -= 17;
    });
    y -= 6;
  };

  // ── Cover header
  const bandH = 190;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: heroBg });
  page.drawCircle({ x: W - 40, y: H - 40, size: 110, color: g1, opacity: 0.25 });
  page.drawCircle({ x: W - 150, y: H - bandH + 80, size: 55, color: g2, opacity: 0.18 });
  drawGradientBar(page, 0, H - bandH - 5, W, 5, g1, g2);
  const logo = await embedBrandImage(doc, theme.logoDarkUrl ?? theme.logoUrl);
  if (logo) {
    const lh = 30;
    const lw = Math.min(170, (logo.width / logo.height) * lh);
    page.drawImage(logo, { x: M, y: H - 34 - lh, width: lw, height: (logo.height / logo.width) * lw });
  } else text(tenant.name, M, H - 52, 14, fonts.sansBold, heroFg);
  const kicker = "EVENT REPORT";
  text(kicker, W - M - width(kicker, fonts.sansBold, 9), H - 46, 9, fonts.sansBold, heroFg, 0.8);
  y = H - 100;
  for (const l of wrap(event.title, fonts.sansBold, 22, W - 2 * M).slice(0, 2)) {
    text(l, M, y, 22, fonts.sansBold, heroFg);
    y -= 27;
  }
  const typeLabel = event.category?.name ?? EVENT_TYPE_LABELS[event.type];
  const where = [event.mode === "ONLINE" ? "Online" : event.venue, event.campuses.length ? event.campuses.map((x) => x.campus.name).join(", ") : "All campuses"].filter(Boolean).join(" · ");
  text(clip(`${typeLabel}  ·  ${when(event.startsAt, event.endsAt)}`, fonts.sans, 10, W - 2 * M), M, y, 10, fonts.sans, heroFg, 0.9);
  y -= 15;
  text(clip(where, fonts.sans, 10, W - 2 * M), M, y, 10, fonts.sans, heroFg, 0.9);
  y -= 15;
  text(clip(`Status: ${human(event.status)}${event.owner ? `   ·   Owner: ${event.owner.name}` : ""}`, fonts.sans, 9, W - 2 * M), M, y, 9, fonts.sans, heroFg, 0.75);
  y = H - bandH - 30;

  // ── Key numbers
  const r = outcome.registrations;
  // Events run before the site existed have their turnout recorded on the event instead of registrations.
  const cfg = (event.config ?? {}) as { participants?: number; registered?: number; teams?: number; prizePool?: string };
  const recorded = !r.registered ? Number(cfg.participants) || Number(cfg.registered) || 0 : 0;
  const teamsCount = outcome.teams.total || Number(cfg.teams) || 0;
  const tiles: [string, string][] = [
    recorded ? ["Participants", recorded.toLocaleString("en-IN")] : ["Registered", r.registered.toLocaleString("en-IN")],
    ["Attended", recorded ? "–" : r.attended.toLocaleString("en-IN")],
    ["Attendance", r.registered ? `${Math.round(r.attendanceRate)}%` : "–"],
    ["Feedback", outcome.feedback.avgRating ? `${outcome.feedback.avgRating}/5` : "–"],
    ["Certificates", outcome.certificates.issued.toLocaleString("en-IN")],
    ["LinkedIn posts", `${outcome.linkedin.posted}${outcome.linkedin.drafts ? ` / ${outcome.linkedin.drafts}` : ""}`],
    ["Tasks done", `${outcome.tasks.done} / ${outcome.tasks.total}`],
    [event.feeAmount ? "Revenue" : "Teams", event.feeAmount ? inr(outcome.revenue.paid) : teamsCount ? String(teamsCount) : "–"],
  ];
  const tw = (W - 2 * M - 3 * 10) / 4;
  tiles.forEach(([label, value], i) => {
    const x = M + (i % 4) * (tw + 10);
    const ty = y - Math.floor(i / 4) * 62;
    page.drawRectangle({ x, y: ty - 44, width: tw, height: 54, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.8 });
    page.drawRectangle({ x, y: ty + 8, width: tw, height: 2, color: i % 2 ? accent : primary });
    text(label.toUpperCase(), x + 10, ty - 6, 7, fonts.sansSemi, muted);
    text(clip(value, fonts.sansBold, 18, tw - 20), x + 10, ty - 30, 18, fonts.sansBold, ink);
  });
  y -= 2 * 62 + 10;

  // ── Leadership summary (AI), if one was made on the Report tab
  const s = outcome.aiSummary;
  if (s) {
    section("Summary", "AI review of this report's data");
    const verdict: Record<string, [string, RGB]> = {
      strong: ["STRONG RESULT", rgb(0.06, 0.55, 0.35)], good: ["GOOD RESULT", rgb(0.1, 0.45, 0.75)],
      mixed: ["MIXED RESULT", rgb(0.8, 0.5, 0.05)], weak: ["NEEDS ATTENTION", rgb(0.8, 0.2, 0.2)],
    };
    const [vl, vc] = verdict[s.verdict] ?? verdict.mixed;
    page.drawRectangle({ x: M, y: y - 4, width: width(vl, fonts.sansBold, 8) + 14, height: 15, color: shade(vc, 0.85) });
    text(vl, M + 7, y, 8, fonts.sansBold, vc);
    y -= 22;
    para(s.headline, 12.5, ink, fonts.sansBold);
    y -= 2;
    para(s.summary, 10, shade(ink, 0.1));
    y -= 6;
    for (const [title, items, col] of [
      ["What went well", s.highlights, rgb(0.06, 0.55, 0.35)], ["What fell short", s.concerns, rgb(0.8, 0.5, 0.05)],
      ["Why", s.why, rgb(0.1, 0.45, 0.75)], ["Next time", s.recommendations, primary],
    ] as const) {
      if (!items.length) continue;
      need(40);
      text(title, M, y, 10.5, fonts.sansBold, col);
      y -= 15;
      bullets([...items], col);
      y -= 4;
    }
  }

  // ── Registrations
  section("Registrations and attendance");
  const statusRows = Object.entries(r.byStatus).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: human(k), value: n }));
  if (statusRows.length) bars(statusRows, primary);
  else if (recorded) para(`${recorded.toLocaleString("en-IN")} participants${cfg.teams ? ` in ${cfg.teams} teams` : ""} took part (recorded for this event; registrations weren't taken on this site, so there's no breakdown).`, 10, ink);
  else para("No registrations were recorded on the site for this event.", 10, muted);
  const campusRows = r.byCampus.filter((x) => x.count > 0).slice(0, 12).map((x) => ({ label: x.campus, value: x.count }));
  if (campusRows.length > 1 || (campusRows.length === 1 && campusRows[0].label !== "Unassigned")) {
    y -= 6;
    need(30);
    text("By campus", M, y, 10.5, fonts.sansBold, ink);
    y -= 16;
    bars(campusRows, accent);
  }

  // ── Results
  if (outcome.teams.total) {
    section("Teams and results", `${outcome.teams.total} teams · ${outcome.teams.participants} members · ${outcome.teams.submitted} submitted`);
    if (outcome.teams.winners.length) {
      table([{ label: "Award", w: 150 }, { label: "Team", w: W - 2 * M - 150 }], outcome.teams.winners.map((w) => [human(w.award ?? "Award"), w.team]));
    }
    if (outcome.teams.leaderboard.length) {
      need(30);
      text("Top of the leaderboard", M, y, 10.5, fonts.sansBold, ink);
      y -= 16;
      table(
        [{ label: "#", w: 30 }, { label: "Team", w: 170 }, { label: "Project", w: W - 2 * M - 270 }, { label: "Score", w: 70 }],
        outcome.teams.leaderboard.map((l, i) => [String(i + 1), l.team.name, l.team.projectTitle ?? "", `${Math.round(l.total)}/100`]),
      );
    }
  }

  if (!outcome.teams.total && (cfg.teams || cfg.prizePool)) {
    section("Teams and results");
    bullets([cfg.teams ? `${cfg.teams} teams took part` : "", cfg.prizePool ? `Prize pool: ${cfg.prizePool}` : "", "Results weren't recorded on this site."].filter(Boolean), primary);
  }

  // ── Guests
  if (outcome.guests.length) {
    section("Speakers and guests");
    table(
      [{ label: "Name", w: 160 }, { label: "Role", w: W - 2 * M - 250 }, { label: "Status", w: 90 }],
      outcome.guests.map((g) => [g.name, [g.designation, g.organization].filter(Boolean).join(", "), human(g.status)]),
    );
  }

  // ── Feedback
  section("Feedback", `${outcome.feedback.responses} responses`);
  if (outcome.feedback.responses) {
    para(`Average rating ${outcome.feedback.avgRating ?? "–"}/5${outcome.feedback.avgNps != null ? `   ·   Recommend score ${outcome.feedback.avgNps}/10` : ""}`, 10.5, ink, fonts.sansSemi);
    y -= 4;
    for (const fb of comments) {
      const lines = wrap(`“${fb.comment!.replace(/\s+/g, " ").trim().slice(0, 400)}”`, fonts.sans, 9.5, W - 2 * M - 40);
      need(lines.length * 13 + 10);
      page.drawRectangle({ x: M, y: y - lines.length * 13 + 8, width: 2.5, height: lines.length * 13 + 2, color: accent });
      text(`${fb.rating}/5`, M + 10, y, 8, fonts.sansBold, muted);
      lines.forEach((l, i) => text(l, M + 36, y - i * 13, 9.5, fonts.sans, ink));
      y -= lines.length * 13 + 6;
    }
  } else para("No feedback was collected for this event.", 10, muted);

  // ── Photos and social
  section("Photos and social media");
  const facts = [
    `${outcome.media.items} photos and files${outcome.media.driveFolderUrl ? ` (folder: ${outcome.media.driveFolderUrl})` : ""}`,
    `${outcome.social.posted} of ${outcome.social.planned} planned social posts published`,
    `${outcome.linkedin.posted} participants posted on LinkedIn (${outcome.linkedin.drafts} drafts prepared)`,
    `${highlights} posts featured on the event page`,
  ];
  bullets(facts, primary);
  const posted = outcome.social.posts.filter((p) => p.url).slice(0, 8);
  if (posted.length) {
    y -= 4;
    table([{ label: "Platform", w: 90 }, { label: "Status", w: 80 }, { label: "Link", w: W - 2 * M - 170 }], posted.map((p) => [human(p.platform), human(p.status), p.url!]));
  }
  if (photos.length) {
    const imgs = (await Promise.all(photos.map((p) => fetchImage(doc, thumb(p.url))))).filter((x): x is PDFImage => !!x);
    if (imgs.length) {
      const pw = (W - 2 * M - 2 * 8) / 3;
      const ph = pw * 0.68;
      const rowsN = Math.ceil(imgs.length / 3);
      need(rowsN * (ph + 8) + 6);
      imgs.forEach((img, i) => {
        const x = M + (i % 3) * (pw + 8);
        const top = y - Math.floor(i / 3) * (ph + 8);
        // cover-crop by scaling the image to fill the tile
        const sc = Math.max(pw / img.width, ph / img.height);
        const iw = img.width * sc;
        const ih = img.height * sc;
        page.drawRectangle({ x, y: top - ph, width: pw, height: ph, color: soft });
        page.drawImage(img, { x: x + (pw - iw) / 2, y: top - ph + (ph - ih) / 2, width: iw, height: ih });
      });
      y -= rowsN * (ph + 8) + 4;
    }
  }

  // ── Money
  if (event.feeAmount || outcome.budget.planned || outcome.budget.actual) {
    section("Money");
    const rows: string[][] = [];
    if (outcome.budget.planned || outcome.budget.actual) {
      rows.push(["Budget planned", rupees(outcome.budget.planned)], ["Spent", rupees(outcome.budget.actual)]);
      const diff = outcome.budget.planned - outcome.budget.actual;
      if (outcome.budget.planned) rows.push([diff >= 0 ? "Under budget by" : "Over budget by", rupees(Math.abs(diff))]);
    }
    if (event.feeAmount) {
      rows.push(["Registration fees collected", `${inr(outcome.revenue.paid)} from ${outcome.revenue.count} payments`]);
      if (outcome.revenue.refunded) rows.push(["Refunded", inr(outcome.revenue.refunded)]);
    }
    table([{ label: "Item", w: 200 }, { label: "Amount", w: W - 2 * M - 200 }], rows);
  }

  // ── Who did what
  if (tasks.length) {
    section("Who did what", `${tasks.filter((t) => t.status === "DONE").length} of ${tasks.length} checklist tasks done`);
    const teamName = (t: string | null) => (t ? WORK_TEAM_LABELS[t as keyof typeof WORK_TEAM_LABELS] ?? human(t) : "General");
    table(
      [{ label: "Task", w: 190 }, { label: "Team", w: 75 }, { label: "Status", w: 65 }, { label: "Done by", w: 90 }, { label: "Done on", w: W - 2 * M - 420 }],
      tasks.map((t) => [
        `${t.title}${t.evidenceUrl ? " (proof)" : ""}`, teamName(t.team), human(t.status),
        t.assignee?.name ?? "–", t.completedAt ? day(t.completedAt) : t.dueAt && t.status !== "DONE" ? `due ${day(t.dueAt)}` : "",
      ]),
    );
  }

  // ── Footer on every page
  const pages = doc.getPages();
  const site = (await brandBaseUrl(tenant.id)).replace(/^https?:\/\//, "");
  const generated = `Generated ${day(new Date())}`;
  pages.forEach((p, i) => {
    const left = clip(`${tenant.name}  ·  ${event.title}`, fonts.sans, 7.5, W - 2 * M - 160);
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.5, color: line });
    const lp = fonts.sans.pick(left);
    p.drawText(lp.text, { x: M, y: M - 20, size: 7.5, font: lp.font, color: muted });
    const right = `${generated}  ·  ${site}  ·  Page ${i + 1} of ${pages.length}`;
    const rp = fonts.sans.pick(right);
    p.drawText(rp.text, { x: W - M - fonts.sans.width(right, 7.5), y: M - 20, size: 7.5, font: rp.font, color: muted });
  });

  const slug = event.slug || "event";
  return { pdf: await doc.save(), filename: `${slug}-report.pdf` };
}
