const nodemailer = require('nodemailer');
const { translate, RTL_LANGS } = require('./i18n');
const { emailShell, C, F } = require('./emailTemplate');
const templates = require('./emailTemplateStore');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return transporter;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function firstNameOf(name, lang) {
  return (name || '').trim().split(' ')[0] || translate(lang, 'email.there');
}

// tpl: wording from emailTemplateStore (admin-editable); all of it is escaped.
function otpEmailHtml({ name, otp, expiresMinutes, lang = 'en', tpl = templates.otpDefaults(lang) }) {
  const t = (key, vars) => translate(lang, `email.${key}`, vars);
  const w = (key, vars = {}) => templates.fill(escapeHtml(tpl[key] || ''), vars).replace(/\n/g, '<br>');
  const rtl = RTL_LANGS.has(lang);
  const textFont = rtl ? F.arabic : F.body;
  const headFont = rtl ? F.arabic : F.display;
  const firstName = escapeHtml(firstNameOf(name, lang));
  // Each digit in its own tile, like a scoreboard. Digits stay LTR in Arabic.
  const digits = String(otp).split('').map((d) =>
    `<td style="padding:0 3px;"><div style="width:44px;height:58px;line-height:58px;text-align:center;background:${C.raised};border:1px solid ${C.line};border-bottom:3px solid ${C.red};border-radius:4px 4px 0 0;font-family:${F.display};font-size:34px;font-weight:900;color:${C.ink};">${escapeHtml(d)}</div></td>`).join('');

  const body = `
    <tr>
      <td class="px" style="padding:30px 28px 8px;">
        <p style="margin:0 0 10px;font-family:${headFont};font-size:14px;font-weight:800;letter-spacing:${rtl ? '0' : '.14em'};text-transform:uppercase;color:${C.red};">${w('title')}</p>
        <h1 class="h1" style="margin:0 0 14px;font-family:${headFont};font-size:44px;line-height:1;font-weight:900;text-transform:uppercase;color:${C.ink};">${w('greeting', { name: firstName })}</h1>
        <p style="margin:0;font-family:${textFont};font-size:16px;line-height:1.65;color:${C.body};">${w('intro')}</p>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:26px 12px 22px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="ltr"><tr>${digits}</tr></table>
      </td>
    </tr>
    <tr>
      <td class="px" style="padding:0 28px 30px;">
        <p style="margin:0;padding:12px 14px;background:${C.raised};border:1px solid ${C.line};border-radius:4px;font-family:${textFont};font-size:13px;line-height:1.6;color:${C.muted};">${w('expiry', { minutes: expiresMinutes })}</p>
      </td>
    </tr>`;

  return emailShell({
    lang, title: tpl.title, preheader: t('textCode', { otp }), kicker: tpl.kicker, bodyHtml: body,
    tagline: rtl ? t('taglineHtml') : '',
  });
}

function otpEmailText({ name, otp, expiresMinutes, lang = 'en', tpl = templates.otpDefaults(lang) }) {
  const t = (key, vars) => translate(lang, `email.${key}`, vars);
  const w = (key, vars) => templates.fill(tpl[key], vars);
  return `${w('greeting', { name: firstNameOf(name, lang) })}\n\n${t('textCode', { otp })}\n\n${w('expiry', { minutes: expiresMinutes })}\n\n${t('tagline')}\n${t('brand')}`;
}

// Brevo transactional API from its own subdomain (account.adrenaline98.com,
// separate from marketing on news.) first;
// Gmail SMTP stays as the fallback so a Brevo outage or daily-limit hit never
// blocks sign-up or login.
async function sendViaBrevo({ to, subject, html, text }) {
  if (!process.env.BREVO_API_KEY) return false;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Adrenaline', email: process.env.BREVO_OTP_SENDER || 'verify@account.adrenaline98.com' },
      replyTo: { email: process.env.BREVO_REPLY_TO || '98adrenaline@gmail.com' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      tags: ['otp'],
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

// `lang` is the language the visitor was using when the code was requested.
// `tpl` overrides the saved wording (used by the admin "send me a test").
async function sendOtpEmail({ to, name, otp, expiresMinutes = 10, lang = 'en', tpl }) {
  let wording = tpl;
  if (!wording) {
    try { wording = await templates.getOtp(lang); } catch (_) { wording = templates.otpDefaults(lang); }
  }
  const message = {
    to,
    subject: templates.fill(wording.subject, { otp }),
    html: otpEmailHtml({ name, otp, expiresMinutes, lang, tpl: wording }),
    text: otpEmailText({ name, otp, expiresMinutes, lang, tpl: wording }),
  };

  try {
    if (await sendViaBrevo(message)) return true;
  } catch (err) {
    console.error('[email] Brevo OTP send failed, falling back to Gmail:', err.message);
  }

  const t = getTransporter();
  if (!t) {
    console.warn('[email] EMAIL_USER/EMAIL_PASS not configured - skipping OTP email send.');
    return false;
  }
  await t.sendMail({ from: `"Adrenaline" <${process.env.EMAIL_USER}>`, ...message });
  return true;
}

function generateOtp() {
  const crypto = require('crypto');
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

module.exports = { sendOtpEmail, generateOtp, otpEmailHtml };
