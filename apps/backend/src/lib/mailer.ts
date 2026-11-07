import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }
  return transporter;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}) {
  const t = getTransporter();
  try {
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || "noreply@staynova.com",
      to,
      subject,
      html,
      text,
    });
    return info;
  } catch (err) {
    console.error("Email send failed", err);
    throw err;
  }
}
