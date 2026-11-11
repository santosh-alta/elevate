import Link from "next/link";
import { ChevronDown, Crown, Lock, Medal, Paperclip, Trophy, Users } from "lucide-react";
import { AWARD_LABELS, eventFee, fmtDateTime, money } from "@/lib/format";
import type { ElevateEvent, Payment, ProblemStatement, Team, Track, Winner } from "@/lib/types";
import { RichText } from "./rich-text";
import { Badge } from "./ui/badge";
import { buttonClass } from "./ui/button";
import { cn } from "./ui/cn";
import { PaymentStatusBadge } from "./payment-status";

/** "₹499 per person", with the regular price struck through during early bird. */
export function PriceTag({ event, size = "md" }: { event: ElevateEvent; size?: "sm" | "md" }) {
  const fee = eventFee(event);
  if (!fee) return <Badge tone="green" className={size === "md" ? "px-3 py-1 text-sm" : undefined}>Free</Badge>;
  const early = fee.currentAmount < fee.amount;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", size === "md" ? "text-base" : "text-sm")}>
      <span className="font-bold text-fg">{money(fee.currentAmount, fee.currency)}</span>
      {early && <s className="text-muted">{money(fee.amount, fee.currency)}</s>}
      <span className="text-xs text-muted">{fee.feeType === "PER_TEAM" ? "per team" : "per person"}</span>
      {early && fee.earlyBirdEndsAt && <Badge tone="amber">Early bird till {fmtDateTime(fee.earlyBirdEndsAt)}</Badge>}
    </span>
  );
}

const PODIUM_STYLE: Record<string, { h: string; ring: string; icon: React.ReactNode }> = {
  WINNER: { h: "sm:h-44", ring: "ring-amber-400 bg-amber-50", icon: <Crown className="h-6 w-6 text-amber-500" /> },
  RUNNER_UP: { h: "sm:h-36", ring: "ring-slate-300 bg-slate-50", icon: <Medal className="h-6 w-6 text-slate-400" /> },
  SECOND_RUNNER_UP: { h: "sm:h-28", ring: "ring-orange-300 bg-orange-50", icon: <Medal className="h-6 w-6 text-orange-400" /> },
};

function Avatars({ members }: { members?: Winner["members"] }) {
  if (!members?.length) return null;
  return (
    <div className="mt-2 flex justify-center -space-x-2">
      {members.slice(0, 5).map((m, i) => (
        m.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img key={i} src={m.avatarUrl} alt={m.name} title={m.name} className="h-7 w-7 rounded-full border-2 border-card object-cover" />
          : <span key={i} title={m.name} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary/15 text-[10px] font-semibold text-primary">{m.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>
      ))}
    </div>
  );
}

/** Winners podium (2nd · 1st · 3rd), then special mentions. */
export function WinnersPodium({ winners }: { winners: Winner[] }) {
  const sorted = winners.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const top = ["RUNNER_UP", "WINNER", "SECOND_RUNNER_UP"].map((a) => sorted.find((w) => w.award === a)).filter((w): w is Winner => !!w);
  const others = sorted.filter((w) => !top.includes(w));
  return (
    <div className="space-y-4">
      {top.length > 0 && (
        <div className="grid items-end gap-3 sm:grid-cols-3">
          {top.map((w) => {
            const st = PODIUM_STYLE[w.award ?? ""] ?? PODIUM_STYLE.SECOND_RUNNER_UP;
            return (
              <div key={w.teamId} className={cn("flex flex-col items-center justify-end rounded-brand p-4 text-center ring-2", st.ring, st.h, w.award === "WINNER" && "order-first sm:order-none")}>
                {st.icon}
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{AWARD_LABELS[w.award ?? ""] ?? w.award}</p>
                <p className="text-lg font-bold leading-tight text-fg">{w.teamName}</p>
                {w.projectTitle && <p className="text-xs text-muted">{w.projectTitle}</p>}
                <Avatars members={w.members} />
              </div>
            );
          })}
        </div>
      )}
      {others.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {others.map((w) => (
            <li key={w.teamId} className="flex items-center gap-3 rounded-brand border border-border bg-card p-3">
              <Trophy className="h-5 w-5 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="font-medium">{w.teamName}</p>
                <p className="text-xs text-muted">{AWARD_LABELS[w.award ?? ""] ?? w.award}{w.projectTitle ? ` · ${w.projectTitle}` : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Expandable problem statement card; unreleased ones show only their release time. */
export function ProblemStatementCard({ p, tracks }: { p: ProblemStatement; tracks: Track[] }) {
  const locked = !!p.releaseAt && new Date(p.releaseAt).getTime() > Date.now();
  const track = tracks.find((t) => t.id === p.trackId)?.name;
  const meta = (
    <div className="flex flex-wrap items-center gap-1.5">
      {p.code && <span className="font-mono text-xs font-semibold text-primary">{p.code}</span>}
      {track && <Badge tone="primary">{track}</Badge>}
      {p.difficulty && <Badge tone={p.difficulty === "Hard" ? "red" : p.difficulty === "Medium" ? "amber" : "green"}>{p.difficulty}</Badge>}
      {p.sponsorName && <Badge tone="purple">by {p.sponsorName}</Badge>}
    </div>
  );
  if (locked) {
    return (
      <div className="flex items-center gap-3 rounded-brand border border-dashed border-border bg-card p-4">
        <Lock className="h-5 w-5 shrink-0 text-muted" />
        <div className="min-w-0">
          {meta}
          <p className="font-medium">{p.title || "Problem statement"}</p>
          <p className="text-xs text-muted">Released at {fmtDateTime(p.releaseAt)}</p>
        </div>
      </div>
    );
  }
  return (
    <details className="group rounded-brand border border-border bg-card shadow-sm open:shadow-md">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          {meta}
          <p className="mt-1 font-semibold">{p.title}</p>
        </div>
        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-4 pb-4 pt-3">
        <RichText html={p.html} size="sm" />
        {(p.attachments?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {p.attachments!.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}><Paperclip className="h-3.5 w-3.5" />{a.label || "Attachment"}</a>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

/** Logged-in member's team summary on the event page. */
export function MyTeamCard({ event, team, payment }: { event: ElevateEvent; team: Team; payment?: Payment | null }) {
  return (
    <div className="rounded-brand border border-primary/30 bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">My team</p>
          <p className="text-lg font-semibold">{team.name}</p>
          {team.problemStatement && <p className="text-xs text-muted">{team.problemStatement.code ? `${team.problemStatement.code} · ` : ""}{team.problemStatement.title}</p>}
        </div>
        {team.award ? <Badge tone="amber">{AWARD_LABELS[team.award] ?? team.award}</Badge> : <Users className="h-5 w-5 text-muted" />}
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        <ul className="space-y-1">
          {(team.members ?? []).map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2">
              <span className="truncate">{m.user?.name ?? m.user?.email ?? "Member"}</span>
              {m.isLeader && <Badge tone="primary">Leader</Badge>}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-muted">Payment</span>
          {payment ? <PaymentStatusBadge status={payment.status} /> : team.paymentStatus ? <PaymentStatusBadge status={team.paymentStatus} /> : <span className="text-xs text-muted">{event.fee || event.feeAmount ? "—" : "Free event"}</span>}
        </div>
        {event.modules?.submissions && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted">Submission</span>
            {team.submittedAt ? <Badge tone="green">Submitted {fmtDateTime(team.submittedAt)}</Badge> : team.projectTitle ? <Badge tone="amber">Draft</Badge> : <Badge>Not started</Badge>}
          </div>
        )}
        <Link href={`/events/${event.slug}/team`} className={buttonClass("primary", "md", "w-full")}>Open team page</Link>
      </div>
    </div>
  );
}
