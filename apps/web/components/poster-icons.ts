import {
  Binary, Blocks, Bot, BrainCircuit, Briefcase, Code, Cpu, Database, Flame, Gamepad2, Ghost, Globe, GraduationCap, Handshake,
  Laptop, Lightbulb, Map, Medal, Mic, Music, PartyPopper, Presentation, Rocket, Route, Sparkles, Terminal, Trophy, Users,
  Workflow, Wrench, type LucideIcon,
} from "lucide-react";
import type { ElevateEvent } from "@/lib/types";

/** Topic → icon, checked against the title, tagline and tags (first matches win). */
const TOPICS: [RegExp, LucideIcon][] = [
  [/hallowe|hackoween|haunt/i, Ghost],
  [/diwali|deepavali|ethnic/i, Flame],
  [/robot/i, Bot],
  [/e-?sports?|gaming/i, Gamepad2],
  [/quiz/i, BrainCircuit],
  [/treasure hunt/i, Map],
  [/hack/i, Laptop],
  [/icpc|competitive programming|coding contest|coding competition/i, Trophy],
  [/\bdsa\b|algorithm|data structure/i, Binary],
  [/data engineer|\bdata\b|database|sql/i, Database],
  [/web dev|\bweb\b|frontend|full[- ]?stack/i, Globe],
  [/automat/i, Workflow],
  [/gen ?ai|\bai\b|artificial intelligence|machine learning|\bml\b|llm/i, Sparkles],
  [/entrepreneur|startup|founder/i, Rocket],
  [/fundamental|basics|foundation/i, Blocks],
  [/roadmap|\bplan\b|path to|year plan/i, Route],
  [/first year|fresher|campus to|graduat/i, GraduationCap],
  [/\bjobs?\b|career|placement|hired|job-ready|compan(y|ies)|interview/i, Briefcase],
  [/fest|cultur|celebrat|party/i, PartyPopper],
  [/music|dance/i, Music],
  [/challenge|innovat|idea/i, Lightbulb],
  [/hardware|iot|embedded|electronics/i, Cpu],
  [/code|coding|program/i, Terminal],
];

/** Fallback by event type, so every poster has something relevant. */
const BY_TYPE: Partial<Record<string, LucideIcon>> = {
  HACKATHON: Code, COMPETITION: Trophy, CODING_CONTEST: Terminal, QUIZ: BrainCircuit, STARTUP_PITCH: Rocket,
  SEMINAR: Mic, INDUSTRY_SEMINAR: Mic, GUEST_LECTURE: Mic, PANEL_DISCUSSION: Users, CONFERENCE: Users,
  WEBINAR: Presentation, WORKSHOP: Wrench, BOOTCAMP: Wrench, ENTREPRENEURSHIP: Rocket,
  CULTURAL: PartyPopper, TECH_FEST: PartyPopper, SPORTS: Medal, CAREER_FAIR: Briefcase, ALUMNI_MEET: Handshake,
  MEETUP: Users, ORIENTATION: GraduationCap,
};

/** Up to three distinct icons for an event's generated poster: the main topic first. */
export function posterIcons(event: Pick<ElevateEvent, "title" | "tagline" | "tags" | "type">): LucideIcon[] {
  const text = [event.title, event.tagline, ...(event.tags ?? [])].filter(Boolean).join(" · ");
  const out: LucideIcon[] = [];
  for (const [re, icon] of TOPICS) if (re.test(text) && !out.includes(icon)) out.push(icon);
  for (const extra of [BY_TYPE[event.type], Sparkles, Lightbulb]) if (extra && out.length < 3 && !out.includes(extra)) out.push(extra);
  return out.slice(0, 3);
}
