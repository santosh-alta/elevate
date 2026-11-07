import {
  BookOpen, Briefcase, CalendarDays, Camera, Code, Coffee, Cpu, Flag, Globe, GraduationCap, Handshake, Heart, Lightbulb,
  Megaphone, Mic, Music, PartyPopper, Presentation, Rocket, Sparkles, Star, Target, Trophy, Users, Wrench, type LucideIcon,
} from "lucide-react";

/** The lucide icons the API may name (family icons + the brand event type icon picker set). */
export const EVENT_ICONS: Record<string, LucideIcon> = {
  Mic, Wrench, Trophy, Users, PartyPopper,
  Rocket, Lightbulb, Code, Cpu, Briefcase, GraduationCap, Presentation, BookOpen, Coffee, Handshake,
  Megaphone, Sparkles, Star, Target, Flag, Globe, Heart, Music, Camera, CalendarDays,
};

/** Icon choices offered when creating a brand event type. */
export const CATEGORY_ICON_CHOICES = [
  "Mic", "Presentation", "GraduationCap", "BookOpen", "Wrench", "Code", "Cpu", "Lightbulb", "Rocket", "Trophy", "Target", "Flag",
  "Users", "Handshake", "Coffee", "Briefcase", "Megaphone", "Globe", "Sparkles", "Star", "Heart", "Music", "Camera", "PartyPopper",
] as const;

export function EventIcon({ name, className = "h-5 w-5", fallback = "CalendarDays" }: { name?: string | null; className?: string; fallback?: string }) {
  const Icon = (name && EVENT_ICONS[name]) || EVENT_ICONS[fallback] || CalendarDays;
  return <Icon className={className} aria-hidden />;
}
