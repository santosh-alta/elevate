import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Text, View } from "react-native";
import { EventSummary, eventLabel } from "./api";
import { useSession } from "./session";
import { withAlpha } from "./theme";
import { Badge, Card, IconName, Muted, Row, formatDate, humanize } from "./ui";

export function statusTone(status: string): "success" | "warning" | "primary" | "neutral" | "danger" {
  if (status === "REGISTRATION_OPEN" || status === "LIVE") return "success";
  if (status === "ANNOUNCED") return "primary";
  if (status === "CANCELLED") return "danger";
  if (status === "JUDGING" || status === "REGISTRATION_CLOSED") return "warning";
  return "neutral";
}

const TYPE_ICONS: Record<string, IconName> = {
  HACKATHON: "code-slash",
  COMPETITION: "trophy-outline",
  STARTUP_PITCH: "rocket-outline",
  ENTREPRENEURSHIP: "bulb-outline",
  WORKSHOP: "construct-outline",
  BOOTCAMP: "barbell-outline",
  WEBINAR: "videocam-outline",
  CONFERENCE: "business-outline",
  PANEL_DISCUSSION: "chatbubbles-outline",
  MEETUP: "people-outline",
  CAREER_FAIR: "briefcase-outline",
  INDUSTRY_VISIT: "bus-outline",
  ORIENTATION: "compass-outline",
  ALUMNI_MEET: "school-outline",
  SPORTS: "football-outline",
  CULTURAL: "musical-notes-outline",
  TECH_FEST: "sparkles-outline",
  INDUSTRY_SEMINAR: "mic-outline",
  CODING_CONTEST: "terminal-outline",
  QUIZ: "help-circle-outline",
};

export function eventTypeIcon(type: string): IconName {
  return TYPE_ICONS[type] ?? "mic-outline";
}

export function modeLabel(e: EventSummary): string {
  const campus = e.campuses?.map((c) => c.campus?.name ?? c.name).filter(Boolean).join(", ");
  if (e.mode === "ONLINE") return "Online";
  const where = e.venue ?? campus ?? (e.scope === "CENTRAL" ? "Central" : "");
  return [e.mode === "HYBRID" ? "Hybrid" : null, where].filter(Boolean).join(" · ") || "Offline";
}

/** Small chips for an event's tags. */
export function TagChips({ tags, max }: { tags?: string[] | null; max?: number }) {
  const { theme } = useSession();
  if (!tags?.length) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const more = tags.length - shown.length;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityLabel={`Tags: ${tags.join(", ")}`}>
      {shown.map((tag) => (
        <View
          key={tag}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: withAlpha(theme.colors.accent, 0.35),
            backgroundColor: withAlpha(theme.colors.accent, 0.08),
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.fg }}>#{tag}</Text>
        </View>
      ))}
      {more > 0 ? <Text style={{ fontSize: 11, color: theme.colors.muted, alignSelf: "center" }}>+{more}</Text> : null}
    </View>
  );
}

export function EventCard({ event, onPress }: { event: EventSummary; onPress: () => void }) {
  const { theme } = useSession();
  return (
    <Card onPress={onPress} style={{ padding: 0, overflow: "hidden" }}>
      {event.coverImageUrl ? (
        <Image source={{ uri: event.coverImageUrl }} style={{ height: 130, width: "100%" }} resizeMode="cover" />
      ) : (
        <View
          style={{
            height: 80,
            backgroundColor: withAlpha(theme.colors.primary, 0.1),
            alignItems: "flex-start",
            justifyContent: "flex-end",
            padding: 12,
          }}
        >
          <Ionicons name={eventTypeIcon(event.type)} size={28} color={theme.colors.primary} />
        </View>
      )}
      <View style={{ padding: 16, gap: 6 }}>
        <Row style={{ flexWrap: "wrap" }}>
          <Badge label={eventLabel(event)} tone="primary" />
          <Badge label={humanize(event.status)} tone={statusTone(event.status)} />
        </Row>
        <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.fg }}>{event.title}</Text>
        {event.tagline ? <Muted>{event.tagline}</Muted> : null}
        <Row>
          <Ionicons name="time-outline" size={15} color={theme.colors.muted} />
          <Muted>{formatDate(event.startsAt)}</Muted>
        </Row>
        <Row>
          <Ionicons name={event.mode === "ONLINE" ? "videocam-outline" : "location-outline"} size={15} color={theme.colors.muted} />
          <Muted>{modeLabel(event)}</Muted>
        </Row>
        <TagChips tags={event.tags} max={4} />
      </View>
    </Card>
  );
}
