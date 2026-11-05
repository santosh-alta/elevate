import { requireTenant } from "@/lib/tenant";
import { EventForm } from "../event-form";

export const metadata = { title: "Create event" };

export default async function NewEventPage() {
  const tenant = await requireTenant();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create event</h1>
        <p className="text-sm text-muted">A planning checklist is generated automatically for the event type you pick.</p>
      </div>
      <EventForm campuses={tenant.campuses} />
    </div>
  );
}
