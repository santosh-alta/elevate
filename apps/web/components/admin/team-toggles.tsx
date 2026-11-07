"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Crown } from "lucide-react";
import { WORK_TEAMS, WORK_TEAM_LABELS, type WorkTeam } from "@elevate/shared";
import { callApi } from "@/components/client/api";

/**
 * Puts a staff member in or out of the Operations / Social media teams, and marks them as a team's lead.
 * Leads are copied on that team's task emails.
 */
export function TeamToggles({ membershipId, teams, leadTeams }: { membershipId: string; teams: string[]; leadTeams: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState({ teams, leadTeams });
  const [busy, setBusy] = useState(false);
  const options = WORK_TEAMS.filter((t) => t !== "OWNER") as WorkTeam[];

  async function save(next: { teams: string[]; leadTeams: string[] }) {
    const prev = value;
    setValue(next); setBusy(true);
    try { await callApi("PATCH", `/admin/members/${membershipId}`, next); router.refresh(); }
    catch { setValue(prev); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((t) => {
        const on = value.teams.includes(t);
        const lead = value.leadTeams.includes(t);
        return (
          <span key={t} className={`inline-flex items-center overflow-hidden rounded-full ring-1 ring-inset ${on ? "ring-primary" : "ring-border"}`}>
            <button
              type="button"
              disabled={busy}
              aria-pressed={on}
              onClick={() => save(on
                ? { teams: value.teams.filter((x) => x !== t), leadTeams: value.leadTeams.filter((x) => x !== t) }
                : { teams: [...value.teams, t], leadTeams: value.leadTeams })}
              className={`px-2.5 py-1 text-xs font-medium transition ${on ? "bg-primary text-primary-fg" : "text-muted hover:text-fg"}`}
            >
              {WORK_TEAM_LABELS[t]}
            </button>
            {on && (
              <button
                type="button"
                disabled={busy}
                aria-pressed={lead}
                title={lead ? `Lead of ${WORK_TEAM_LABELS[t]} (copied on its task emails). Click to remove.` : `Make lead of ${WORK_TEAM_LABELS[t]}`}
                onClick={() => save({ teams: value.teams, leadTeams: lead ? value.leadTeams.filter((x) => x !== t) : [...value.leadTeams, t] })}
                className={`flex items-center gap-1 border-l border-primary-fg/30 px-2 py-1 text-xs font-medium transition ${lead ? "bg-highlight text-highlight-fg" : "bg-primary/80 text-primary-fg/80 hover:text-primary-fg"}`}
              >
                <Crown className="h-3 w-3" />{lead ? "Lead" : ""}
                <span className="sr-only">{lead ? "Lead" : "Make lead"}</span>
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
