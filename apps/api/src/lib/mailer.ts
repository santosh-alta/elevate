import nodemailer, { type Transporter } from "nodemailer";

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  cc?: string[];
}

export type SendResult = { status: "SENT" } | { status: "SKIPPED"; reason: string };

let transport: Transporter | null = null;

/**
 * Sends one email through SMTP_URL.
 * Without SMTP_URL: in development the email is logged and counted as sent; in production it is SKIPPED.
 * Throws on SMTP errors so the worker can retry.
 */
export async function sendEmail(mail: OutgoingEmail): Promise<SendResult> {
  const url = process.env.SMTP_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") return { status: "SKIPPED", reason: "SMTP_URL is not configured" };
    console.info(
      `\n[mail:dev] ─────────────────────────────\nFrom: ${mail.from}\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n─────────────────────────────────────────`,
    );
    return { status: "SENT" };
  }
  transport ??= nodemailer.createTransport(url);
  await transport.sendMail(mail);
  return { status: "SENT" };
}
