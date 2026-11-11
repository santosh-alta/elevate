import type { TourStep } from "@/components/client/site-tour";

/**
 * Tour steps. Targets are `data-tour` attributes; a step is skipped when its element isn't on the
 * current page (home-only steps on an event page, Insights for non-admins, and so on).
 */
/** Browsing pages only: not check-in, judging, sign-in or forms. */
export const PUBLIC_TOUR_PATHS = "^/(events(/[^/]+)?|campuses(/[^/]+)?|winners|calendar)?/?$";

export function publicTour(brand: string): TourStep[] {
  return [
    { title: `Welcome to ${brand} Events 👋`, body: "Hackathons, workshops, talks and competitions across every campus, all in one place. Here's a quick look around. It takes under a minute." },
    { target: "site-nav", title: "Find your way", body: "Browse every event, see them by date on the Calendar, check what's happening at each campus, and meet the winners of past hackathons and competitions." },
    { target: "calendar-filter", title: "Ours and outside events", body: "Solid ones are our own events: register right here. Dashed ones are major hackathons on other platforms (Unstop, Devfolio, MLH, Devpost) that you can join too." },
    { target: "calendar-agenda", title: "Day by day", body: "Everything this month by date. External ones show the deadline to apply and open on the organiser's site." },
    { target: "home-cta", title: "Start here", body: "Explore upcoming events, or open My tickets & certificates to see everything you've registered for and earned." },
    { target: "home-stats", title: "Our community so far", body: "Events held, people who took part, and the campuses that make up the community." },
    { target: "home-campuses", title: "Every campus", body: "Tap a campus to see its upcoming events, past highlights and photos." },
    { target: "home-types", title: "Pick what you like", body: "Jump straight to the kind of event you like: talks, hands-on learning, competitions, community meetups or fests." },
    { target: "home-upcoming", title: "Coming up next", body: "The newest events. Open one to see the schedule, speakers and prizes, then register in a click." },
    { target: "event-register", title: "Register in one click", body: "Sign in and register. Your ticket with a QR code arrives by email, and reminders follow before the event." },
    { target: "event-sections", title: "Everything about the event", body: "Jump to the schedule, speakers, prizes, rules and FAQs." },
    { target: "event-calendar", title: "Don't miss it", body: "Add the event to Google Calendar or your phone's calendar." },
    { target: "event-share", title: "Bring your friends", body: "Share the event on WhatsApp, LinkedIn or X." },
    { target: "theme", title: "Day or night", body: "Switch between the light and dark look. We'll remember your choice." },
    { target: "assistant", title: "Ask the assistant", body: "Questions about an event, your registration or certificate? Sign in and ask here, any time." },
    { target: "account", title: "Your account", body: "Sign in with Google or an email code. Your tickets, certificates and ready-to-post LinkedIn updates live here." },
    { title: "You're all set 🎉", body: "Find an event you like and register. You can replay this tour any time from “Take a quick tour” at the bottom of the page." },
  ];
}

export function adminTour(brand: string): TourStep[] {
  return [
    { title: `Welcome to ${brand} event operations`, body: "This is where events are planned, run and measured. Here's a quick tour of what each section does." },
    { target: "admin-dashboard", title: "Dashboard", body: "Today at a glance: live and upcoming events, registrations, and anything that needs your attention." },
    { target: "admin-events-new", title: "Create an event", body: "Set up a page in minutes. AI can draft the description, and you choose the audience (campus, batch, program), tickets, certificates and reminders." },
    { target: "admin-events", title: "Your events", body: "Open an event to manage registrations, run the QR check-in desk, judge on phones, issue certificates and download the report." },
    { target: "admin-review", title: "Review queue", body: "Event pages submitted by organizers wait here for approval before they go live." },
    { target: "admin-tasks", title: "My tasks", body: "Your checklist across events: what operations and social media need to do, and when." },
    { target: "admin-calendar", title: "Calendar", body: "Every event across campuses on one calendar, to avoid clashes." },
    { target: "admin-external", title: "Outside events", body: "Major hackathons on Unstop, Devfolio, MLH and Devpost, pulled daily. Choose which ones students see on the public calendar, or add one yourself." },
    { target: "admin-insights", title: "Insights", body: "Trends, campus comparisons and a scorecard for every event: turnout, ratings, what worked and what to improve." },
    { target: "admin-feedback", title: "Feedback", body: "What participants said after each event, with ratings by area and AI summaries." },
    { target: "admin-guests", title: "Guest library", body: "Speakers, judges and mentors you've worked with, ready to invite again." },
    { target: "admin-settings", title: "Brand settings", body: "Team and roles, notification timings, report recipients, student data sync, certificate and ticket designs." },
    { target: "assistant", title: "Ask the assistant", body: "Ask anything, like “How many registered for the hackathon?” or “Which campus had the best turnout?”" },
    { title: "That's the tour", body: "Replay it any time with “Tour” at the top of the page." },
  ];
}
