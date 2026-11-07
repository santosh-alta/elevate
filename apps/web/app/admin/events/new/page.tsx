import { requireTenant } from "@/lib/tenant";
import { apiList } from "@/lib/api";
import type { ElevateEvent } from "@/lib/types";
import { EventForm } from "../event-form";

export const metadata = { title: "Create event" };

export default async function NewEventPage() {
  const tenant = await requireTenant();
  const fests = await apiList<ElevateEvent>("/events?type=TECH_FEST");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create event</h1>
        <p className="text-sm text-muted">A planning checklist is generated automatically for the event type you pick.</p>
      </div>
      <EventForm campuses={tenant.campuses} parents={fests.map((f) => ({ id: f.id, title: f.title }))} />
    </div>
  );
}
