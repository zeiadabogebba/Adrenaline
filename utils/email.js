const nodemailer = require('nodemailer');
const { translate, RTL_LANGS } = require('./i18n');

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

function wordmarkHtml(size) {
  return `<span style="font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:${size}px;letter-spacing:0.02em;text-transform:uppercase;color:#FFFFFF;">` +
    `<span style="color:#DC2626;">A</span>DREN<span style="color:#DC2626;">A</span>LINE` +
    `</span>`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function firstNameOf(name, lang) {
  return (name || '').trim().split(' ')[0] || translate(lang, 'email.there');
}

function otpEmailHtml({ name, otp, expiresMinutes, lang = 'en' }) {
  const t = (key, vars) => translate(lang, `email.${key}`, vars);
  const rtl = RTL_LANGS.has(lang);
  // Arabic letters must not be letter-spaced or they break apart.
  const spacing = (value) => (rtl ? '0' : value);
  const firstName = escapeHtml(firstNameOf(name, lang));
  return `<!DOCTYPE html>
<html lang="${lang}"${rtl ? ' dir="rtl"' : ''}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t('title')}</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0A0B;font-family:${rtl ? 'Tahoma,' : ''}'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0B;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">

          <tr>
            <td align="center" style="padding-bottom:28px;">
              ${wordmarkHtml(24)}
            </td>
          </tr>

          <tr>
            <td style="background-color:#121214;border:1px solid #2A2D34;border-radius:8px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:4px;background-color:#DC2626;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:36px 32px 8px;">
                    <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:${spacing('0.12em')};text-transform:uppercase;color:#8B867B;">${t('title')}</p>
                    <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;letter-spacing:${spacing('-0.01em')};text-transform:uppercase;color:#FFFFFF;">${t('greeting', { name: firstName })}</h1>
                    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#9CA3AF;">
                      ${t('intro')}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1A1C20;border:1px solid #2A2D34;border-radius:6px;">
                      <tr>
                        <td align="center" style="padding:22px 16px;">
                          <span${rtl ? ' dir="ltr"' : ''} style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:0.35em;color:#EF4444;">${otp}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 36px;">
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#4B5563;">
                      ${t('expiry', { minutes: expiresMinutes })}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-style:${rtl ? 'normal' : 'italic'};color:#9CA3AF;">${t('taglineHtml')}</p>
              <p style="margin:0;font-size:11px;color:#4B5563;">&copy; ${new Date().getFullYear()} ${t('rights')}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function otpEmailText({ name, otp, expiresMinutes, lang = 'en' }) {
  const t = (key, vars) => translate(lang, `email.${key}`, vars);
  return `${t('greeting', { name: firstNameOf(name, lang) })}\n\n${t('textCode', { otp })}\n\n${t('expiry', { minutes: expiresMinutes })}\n\n${t('tagline')}\n${t('brand')}`;
}

// `lang` is the language the visitor was using when the code was requested.
async function sendOtpEmail({ to, name, otp, expiresMinutes = 10, lang = 'en' }) {
  const t = getTransporter();
  if (!t) {
    console.warn('[email] EMAIL_USER/EMAIL_PASS not configured - skipping OTP email send.');
    return false;
  }
  await t.sendMail({
    from: `"Adrenaline" <${process.env.EMAIL_USER}>`,
    to,
    subject: translate(lang, 'email.subject', { otp }),
    html: otpEmailHtml({ name, otp, expiresMinutes, lang }),
    text: otpEmailText({ name, otp, expiresMinutes, lang }),
  });
  return true;
}

function generateOtp() {
  const crypto = require('crypto');
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

module.exports = { sendOtpEmail, generateOtp };
