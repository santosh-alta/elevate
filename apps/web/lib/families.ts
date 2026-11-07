import { EVENT_FAMILIES, EVENT_TYPE_HINTS, EVENT_TYPE_LABELS } from "@elevate/shared";
import type { EventTypesFamily } from "./types";

/** Built-in families from @elevate/shared (no brand types); safe on server and client. */
export function builtInFamilies(): EventTypesFamily[] {
  return EVENT_FAMILIES.map((f) => ({
    key: f.key, label: f.label, description: f.description, icon: f.icon,
    types: f.types.map((t) => ({ type: t, label: EVENT_TYPE_LABELS[t], hint: EVENT_TYPE_HINTS[t], builtIn: true })),
    custom: [],
  }));
}
