import type { Metadata } from "next";
import { requireTenant } from "@/lib/tenant";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = { title: "Privacy policy" };

/** Plain-language privacy policy for the events website and mobile app (linked from the store listing). */
export default async function PrivacyPage() {
  const tenant = await requireTenant();
  const name = tenant.name;
  const email = (tenant.settings.supportEmail as string | undefined) ?? "";
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="space-y-2">
      <h2 className="font-heading text-xl font-bold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-fg/85">{children}</div>
    </section>
  );
  return (
    <>
      <PageHero title="Privacy policy" description={`How ${name} Events (website and mobile app) uses your information.`} size="sm" />
      <article className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        <p className="text-sm text-muted">Last updated: 13 November 2026</p>
        <Section title="Who we are">
          <p>{name} runs this events platform for its students, staff and guests: event pages, registration, tickets, check-in, judging, certificates and event updates. Questions: {email ? <a className="text-primary underline" href={`mailto:${email}`}>{email}</a> : "use the contact details on this site"}.</p>
        </Section>
        <Section title="What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Account:</b> your name, email, and (if you sign in with Google) your Google profile picture.</li>
            <li><b>Profile you choose to add:</b> phone, college, degree, graduation year, city, and links such as LinkedIn, GitHub, LeetCode or portfolio.</li>
            <li><b>Student records:</b> for {name} students, campus, programme and batch from the school&apos;s student database, so we can show you the right events.</li>
            <li><b>Event activity:</b> registrations, answers to registration questions, tickets, check-ins, team membership, judging scores, certificates, feedback and payments (handled by Razorpay; we never see card details).</li>
            <li><b>Photos you upload</b> to event galleries.</li>
            <li><b>Mobile app only:</b> the camera, only while you scan a ticket or check-in QR code; your location, only at the moment you check yourself in at a venue that requires it; and a push token, to send you notifications.</li>
          </ul>
        </Section>
        <Section title="How we use it">
          <p>To run events: confirm registrations, send tickets, reminders and updates (email, in the app and push notifications), check you in, issue certificates, prepare LinkedIn post drafts for you, and improve future events using feedback and attendance numbers. Some features use AI services (Google Gemini or Groq) to draft text such as event descriptions, summaries and posts; we don&apos;t send your personal contact details to them.</p>
          <p>We don&apos;t sell your data or use it for advertising.</p>
        </Section>
        <Section title="Who can see it">
          <p>Event organisers and staff of {name} see the details needed to run the events you join. Judges see team submissions. Your name may appear on public results, certificates and galleries of events you took part in. Service providers that host or deliver the platform (hosting, database, email, payments, push notifications) process data only on our behalf.</p>
        </Section>
        <Section title="Keeping and deleting your data">
          <p>We keep your account while you use it. You can delete your account at any time in the app (Profile → Delete account) or on the website at <a className="text-primary underline" href="/account/delete">/account/delete</a>. Your personal details are erased straight away; past participation is kept only as anonymous numbers so event reports stay correct. Push notifications can be turned off in your phone settings.</p>
        </Section>
        <Section title="Security">
          <p>Data is sent over encrypted connections (HTTPS) and stored with access limited to people who need it for their role.</p>
        </Section>
        <Section title="Changes">
          <p>If this policy changes, we&apos;ll update this page and the date above.</p>
        </Section>
      </article>
    </>
  );
}
