"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WORK_TEAMS, WORK_TEAM_LABELS, type WorkTeam } from "@elevate/shared";
import { callApi } from "@/components/client/api";

/** Chips that put a staff member in or out of the Operations / Social media teams. */
export function TeamToggles({ membershipId, teams }: { membershipId: string; teams: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState<string[]>(teams);
  const [busy, setBusy] = useState(false);
  const options = WORK_TEAMS.filter((t) => t !== "OWNER") as WorkTeam[];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            disabled={busy}
            aria-pressed={on}
            onClick={async () => {
              const next = on ? value.filter((x) => x !== t) : [...value, t];
              setValue(next); setBusy(true);
              try { await callApi("PATCH", `/admin/members/${membershipId}`, { teams: next }); router.refresh(); }
              catch { setValue(value); }
              finally { setBusy(false); }
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${on ? "bg-primary text-primary-fg ring-primary" : "text-muted ring-border hover:text-fg"}`}
          >
            {WORK_TEAM_LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}
