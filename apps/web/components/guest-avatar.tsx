"use client";

import { useId, useState } from "react";
import type { Guest } from "@/lib/types";

/**
 * Speaker / judge / guest photo. Without a photo (or when the link is broken) it shows a professional
 * head-and-shoulders silhouette in a suit on the brand gradient: the usual stand-in on conference sites,
 * rather than a bare initial.
 */
export function GuestAvatar({ guest, size = "h-16 w-16" }: { guest: Pick<Guest, "name" | "photoUrl">; size?: string }) {
  const [broken, setBroken] = useState(false);
  if (guest.photoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={guest.photoUrl} alt={guest.name} referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`${size} shrink-0 rounded-full object-cover`} />
    );
  }
  return <ProfileSilhouette name={guest.name} className={size} />;
}

export function ProfileSilhouette({ name, className = "h-16 w-16" }: { name: string; className?: string }) {
  const bg = `ga-${useId().replace(/:/g, "")}`;
  return (
    <span role="img" aria-label={name} title={name} className={`${className} relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-border`}>
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgb(var(--gradient-from))" stopOpacity="0.28" />
            <stop offset="1" stopColor="rgb(var(--gradient-to))" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="rgb(var(--card))" />
        <rect width="100" height="100" fill={`url(#${bg})`} />
        {/* jacket */}
        <path d="M14 100c0-19 12-31 25-34l11 9 11-9c13 3 25 15 25 34z" fill="rgb(var(--primary))" fillOpacity="0.85" />
        {/* shirt and collar */}
        <path d="M39 66l11 9 11-9-3-4H42z" fill="#ffffff" />
        <path d="M42 62l8 13-6 2-6-11zM58 62l-8 13 6 2 6-11z" fill="rgb(var(--primary))" />
        {/* tie */}
        <path d="M48 75h4l2 4-4 15-4-15z" fill="rgb(var(--accent))" />
        {/* neck and head */}
        <path d="M43.5 50h13v12l-6.5 6-6.5-6z" fill="rgb(var(--primary))" fillOpacity="0.45" />
        <ellipse cx="50" cy="40" rx="15.5" ry="17.5" fill="rgb(var(--primary))" fillOpacity="0.45" />
      </svg>
    </span>
  );
}
