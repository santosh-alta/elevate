import { requireTenant } from "@/lib/tenant";
import { apiList } from "@/lib/api";
import { getEventTypes, getTags } from "@/lib/catalog";
import type { ElevateEvent } from "@/lib/types";
import { EventForm } from "../event-form";
import { getMe, isOrganizerOnly } from "@/lib/auth";

export const metadata = { title: "Create event" };

export default async function NewEventPage() {
  const [tenant, me] = await Promise.all([requireTenant(), getMe()]);
  const organizer = isOrganizerOnly(me);
  const [fests, families, tags] = await Promise.all([apiList<ElevateEvent>("/events?type=TECH_FEST"), getEventTypes(), getTags(true)]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create event</h1>
        <p className="text-sm text-muted">A planning checklist is generated automatically for the event type you pick.</p>
      </div>
      {organizer && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Your page stays hidden while you work on it. When it&apos;s ready, press <span className="font-medium">Submit for review</span>; an admin or
          moderator will approve it (it goes live) or send it back with notes. Events are free unless an admin allows paid registration.
        </p>
      )}
      <EventForm campuses={tenant.campuses} parents={fests.map((f) => ({ id: f.id, title: f.title }))} families={families} tagSuggestions={tags.map((t) => t.tag)} />
    </div>
  );
}
