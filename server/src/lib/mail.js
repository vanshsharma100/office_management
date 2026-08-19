import nodemailer from 'nodemailer';

/**
 * Outgoing mail, used only for "I cannot sign in".
 *
 * Off until it is configured, and it says so plainly rather than failing
 * somewhere confusing. Gmail needs an App Password, not the account password —
 * Google rejects the real one for SMTP.
 */

let cached;

export function mailConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return {
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    user,
    pass,
    from: process.env.SMTP_FROM || user,
    appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),
    configured: Boolean(host && user && pass),
  };
}

function transport() {
  const cfg = mailConfig();
  if (!cfg.configured) return null;
  if (!cached) {
    cached = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      // 465 is implicit TLS; 587 upgrades with STARTTLS.
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }
  return cached;
}

export async function sendMail({ to, subject, text, html }) {
  const cfg = mailConfig();
  const tx = transport();
  if (!tx) throw new Error('Email is not set up on the server yet');
  await tx.sendMail({ from: cfg.from, to, subject, text, html });
}

/** Confirms the SMTP details actually work, without sending anything. */
export async function verifyMail() {
  const tx = transport();
  if (!tx) return { ok: false, error: 'Email is not set up on the server yet' };
  try {
    await tx.verify();
    return { ok: true };
  } catch (err) {
    cached = undefined; // so corrected settings are picked up on the next try
    return { ok: false, error: err.message };
  }
}

export function resetEmail({ name, link, minutes }) {
  return {
    subject: 'Reset your Ftech Office password',
    text: `Hello ${name},\n\nOpen this link to set a new password:\n${link}\n\nIt works once and expires in ${minutes} minutes.\n\nIf you did not ask for this, ignore this email — your password has not changed.`,
    html: `<div style="font-family:Segoe UI,system-ui,sans-serif;font-size:15px;color:#111;line-height:1.6">
      <p>Hello ${escapeHtml(name)},</p>
      <p>Open this link to set a new password:</p>
      <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1B4F9C;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none">Set a new password</a></p>
      <p style="color:#6b7280;font-size:13px">It works once and expires in ${minutes} minutes.<br>
      If you did not ask for this, ignore this email — your password has not changed.</p>
      <p style="color:#6b7280;font-size:12px">Ftech Computers — Office Management System</p>
    </div>`,
  };
}

const escapeHtml = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
