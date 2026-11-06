import type { Guest } from "@/lib/types";

export function GuestAvatar({ guest, size = "h-16 w-16" }: { guest: Pick<Guest, "name" | "photoUrl">; size?: string }) {
  return guest.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={guest.photoUrl} alt={guest.name} className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary`}>{guest.name.slice(0, 1)}</div>
  );
}
