import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { EventSummary, eventLabel } from "./api";
import { useSession } from "./session";
import { withAlpha } from "./theme";
import type { IconName } from "./ui";

/** Topic → icon, checked against the title, tagline and tags (same topics as the website's posters). */
const TOPICS: [RegExp, IconName][] = [
  [/hallowe|hackoween|haunt/i, "skull-outline"],
  [/diwali|deepavali|ethnic/i, "flame-outline"],
  [/robot/i, "hardware-chip-outline"],
  [/e-?sports?|gaming/i, "game-controller-outline"],
  [/quiz/i, "help-circle-outline"],
  [/treasure hunt/i, "map-outline"],
  [/hack/i, "laptop-outline"],
  [/icpc|competitive programming|coding contest|coding competition/i, "trophy-outline"],
  [/\bdsa\b|algorithm|data structure/i, "git-network-outline"],
  [/data engineer|\bdata\b|database|sql/i, "server-outline"],
  [/web dev|\bweb\b|frontend|full[- ]?stack/i, "globe-outline"],
  [/automat/i, "repeat-outline"],
  [/gen ?ai|\bai\b|artificial intelligence|machine learning|\bml\b|llm/i, "sparkles-outline"],
  [/entrepreneur|startup|founder/i, "rocket-outline"],
  [/fundamental|basics|foundation/i, "cube-outline"],
  [/roadmap|\bplan\b|path to|year plan/i, "trail-sign-outline"],
  [/first year|fresher|campus to|graduat/i, "school-outline"],
  [/\bjobs?\b|career|placement|hired|job-ready|compan(y|ies)|interview/i, "briefcase-outline"],
  [/fest|cultur|celebrat|party/i, "balloon-outline"],
  [/music|dance/i, "musical-notes-outline"],
  [/challenge|innovat|idea/i, "bulb-outline"],
  [/hardware|iot|embedded|electronics|wireless/i, "hardware-chip-outline"],
  [/code|coding|program/i, "terminal-outline"],
];

const BY_TYPE: Record<string, IconName> = {
  HACKATHON: "code-slash", COMPETITION: "trophy-outline", CODING_CONTEST: "terminal-outline", QUIZ: "help-circle-outline",
  STARTUP_PITCH: "rocket-outline", SEMINAR: "mic-outline", INDUSTRY_SEMINAR: "mic-outline", GUEST_LECTURE: "mic-outline",
  PANEL_DISCUSSION: "people-outline", CONFERENCE: "people-outline", WEBINAR: "easel-outline", WORKSHOP: "construct-outline",
  BOOTCAMP: "construct-outline", ENTREPRENEURSHIP: "rocket-outline", CULTURAL: "balloon-outline", TECH_FEST: "balloon-outline",
  SPORTS: "medal-outline", CAREER_FAIR: "briefcase-outline", ALUMNI_MEET: "hand-left-outline", MEETUP: "people-outline",
  ORIENTATION: "school-outline",
};

export function posterIcons(e: Pick<EventSummary, "title" | "tagline" | "tags" | "type">): IconName[] {
  const text = [e.title, e.tagline, ...(e.tags ?? [])].filter(Boolean).join(" · ");
  const out: IconName[] = [];
  for (const [re, icon] of TOPICS) if (re.test(text) && !out.includes(icon)) out.push(icon);
  for (const extra of [BY_TYPE[e.type], "sparkles-outline", "bulb-outline"] as (IconName | undefined)[]) {
    if (extra && out.length < 3 && !out.includes(extra)) out.push(extra);
  }
  return out.slice(0, 3);
}

/** Event cover photo; without one, a generated brand poster (navy, brand glows, faint grid, topic icons), like the website. */
export function EventPoster({ event, height = 150, showLabel = true }: { event: EventSummary; height?: number; showLabel?: boolean }) {
  const { theme } = useSession();
  const [failed, setFailed] = useState(false);
  if (event.coverImageUrl && !failed) {
    return <Image source={{ uri: event.coverImageUrl }} onError={() => setFailed(true)} style={{ height, width: "100%" }} resizeMode="cover" />;
  }
  const c = theme.colors;
  const [from, to] = theme.gradient ?? [c.accent, c.secondary];
  const [main, first, second] = posterIcons(event);
  const bubble = (icon: IconName | undefined, size: number, left: string, top: string, color: string, glow = false) =>
    icon ? (
      <View
        style={{
          position: "absolute", left: left as any, top: top as any, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
          borderRadius: size / 2, alignItems: "center", justifyContent: "center",
          backgroundColor: withAlpha(c.heroFg, glow ? 0.07 : 0.08), borderWidth: 1, borderColor: withAlpha(c.heroFg, 0.15),
          ...(glow ? { shadowColor: c.accent, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } } : null),
        }}
      >
        <Ionicons name={icon} size={size * 0.48} color={color} />
      </View>
    ) : null;
  return (
    <View style={{ height, width: "100%", backgroundColor: c.heroBg, overflow: "hidden" }} accessibilityRole="image" accessibilityLabel={`${eventLabel(event)}: ${event.title}`}>
      <Svg width="100%" height="100%" style={{ position: "absolute" }}>
        <Defs>
          <RadialGradient id="g1" cx="100%" cy="0%" rx="70%" ry="90%"><Stop offset="0" stopColor={from} stopOpacity={0.6} /><Stop offset="1" stopColor={from} stopOpacity={0} /></RadialGradient>
          <RadialGradient id="g2" cx="0%" cy="100%" rx="60%" ry="80%"><Stop offset="0" stopColor={to} stopOpacity={0.45} /><Stop offset="1" stopColor={to} stopOpacity={0} /></RadialGradient>
          <Pattern id="grid" width={28} height={28} patternUnits="userSpaceOnUse"><Path d="M28 0H0V28" fill="none" stroke={c.heroFg} strokeOpacity={0.07} strokeWidth={1} /></Pattern>
          <LinearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={from} /><Stop offset="1" stopColor={to} /></LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#g1)" />
        <Rect width="100%" height="100%" fill="url(#g2)" />
        <Rect width="100%" height="100%" fill="url(#grid)" />
        <Rect y={height - 4} width="100%" height={4} fill="url(#bar)" />
      </Svg>
      {bubble(main, Math.round(height * 0.58), "60%", "56%", c.accent, true)}
      {bubble(first, Math.round(height * 0.27), "84%", "28%", withAlpha(c.heroFg, 0.9))}
      {bubble(second, Math.round(height * 0.22), "33%", "76%", withAlpha(c.heroFg, 0.75))}
      {showLabel ? (
        <View style={{ position: "absolute", left: 14, top: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: withAlpha(c.heroFg, 0.1), borderWidth: 1, borderColor: withAlpha(c.heroFg, 0.25) }}>
          <Text style={{ color: c.heroFg, fontSize: 10, fontWeight: "700", letterSpacing: 1.6 }}>{eventLabel(event).toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}
