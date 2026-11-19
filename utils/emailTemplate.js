// Branded email HTML (trip campaigns via Brevo + login codes).
// Table layout + inline styles so it renders the same in Gmail, Outlook and
// Apple Mail. Matches the site: near-black, crimson, Barlow Condensed caps.
// Clients that can't load the web fonts fall back to Arial Narrow / Arial.
const SITE_URL = (process.env.SITE_URL || 'https://adrenaline98.com').replace(/\/+$/, '');

const C = {
  floor: '#0A0A0B', card: '#121214', raised: '#1A1C20', line: '#2A2D34',
  red: '#DC2626', redHot: '#EF4444', ink: '#FFFFFF', body: '#D4D4D8', muted: '#8B8F98', faint: '#5B606B',
};
const F = {
  display: "'Barlow Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif",
  body: "'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif",
  arabic: "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif",
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeUrl = (u) => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

// Cloudinary: a 2:1 banner crop (drops letterbox bars) at email-friendly size.
function emailImage(url) {
  const u = safeUrl(url);
  if (!u) return '';
  return u.includes('res.cloudinary.com') && u.includes('/upload/') && !u.includes('/upload/w_')
    ? u.replace('/upload/', '/upload/w_1200,h_600,c_fill,g_auto,q_auto/')
    : u;
}

function fontFaces() {
  const face = (family, file, weight, style = 'normal') =>
    `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(${SITE_URL}/fonts/${file}.woff2) format('woff2');}`;
  return [
    face('Barlow Condensed', 'barlow-condensed-normal-800-latin', 800),
    face('Barlow Condensed', 'barlow-condensed-normal-900-latin', 900),
    face('Barlow Condensed', 'barlow-condensed-italic-900-latin', 900, 'italic'),
    face('Plus Jakarta Sans', 'plus-jakarta-sans-normal-400-latin', 400),
    face('IBM Plex Sans Arabic', 'ibm-plex-sans-arabic-400-arabic', 400),
    face('IBM Plex Sans Arabic', 'ibm-plex-sans-arabic-700-arabic', 700),
  ].join('');
}

// Small uppercase chip with a red dot, like the site's labels.
const chip = (text, rtl) => `<span style="display:inline-block;padding:5px 10px;background:${C.raised};border:1px solid ${C.line};border-radius:3px;font-family:${rtl ? F.arabic : F.display};font-size:12px;font-weight:800;letter-spacing:${rtl ? '0' : '.12em'};text-transform:uppercase;color:${C.ink};"><span style="color:${C.red};">&#9679;</span>&nbsp;${esc(text)}</span>`;

const taglineHtml = (rtl) => (rtl
  ? `<span style="font-family:${F.arabic};font-weight:700;">حِس <span style="color:${C.red};">الأدرينالين</span>، عيش اللحظة.</span>`
  : `FEEL THE <span style="color:${C.red};">RUSH</span>, LIVE THE MOMENT.`);

/**
 * Shared frame. opts: { lang, title, preheader, kicker, bodyHtml, footerHtml }
 */
function emailShell({ lang = 'en', title = '', preheader = '', kicker = '', bodyHtml = '', footerHtml = '', tagline = '' }) {
  const rtl = lang === 'ar';
  const bodyFont = rtl ? F.arabic : F.body;
  return `<!DOCTYPE html>
<html lang="${esc(lang)}"${rtl ? ' dir="rtl"' : ''}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(title)}</title>
<style>${fontFaces()}
@media (max-width:620px){.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:40px!important}.cell{display:block!important;width:100%!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.floor};font-family:${bodyFont};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.floor};">
  <tr>
    <td align="center" style="padding:28px 12px 40px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td class="px" style="padding:0 4px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:middle;">
                <a href="${SITE_URL}" style="text-decoration:none;"><img src="${SITE_URL}/images/email/wordmark.png" width="158" height="32" alt="ADRENALINE" style="display:block;border:0;width:158px;height:32px;font-family:${F.display};font-size:24px;font-weight:900;font-style:italic;color:${C.ink};"></a>
              </td>
              ${kicker ? `<td align="${rtl ? 'left' : 'right'}" style="vertical-align:middle;">${chip(kicker, rtl)}</td>` : ''}
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:${C.card};border:1px solid ${C.line};border-radius:6px;overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.red};">&nbsp;</td></tr>
              ${bodyHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" class="px" style="padding:28px 16px 0;">
            <img src="${SITE_URL}/images/email/mark.png" width="36" height="36" alt="" style="display:block;border:0;width:36px;height:36px;margin:0 auto 12px;">
            <p style="margin:0 0 14px;font-family:${F.display};font-size:18px;font-weight:900;font-style:italic;letter-spacing:.02em;color:${C.ink};${rtl ? `font-family:${F.arabic};font-style:normal;` : ''}">${tagline || taglineHtml(rtl)}</p>
            ${footerHtml}
            <p style="margin:14px 0 0;font-family:${bodyFont};font-size:11px;color:${C.faint};">&copy; ${new Date().getFullYear()} Adrenaline &middot; <a href="${SITE_URL}" style="color:${C.faint};">adrenaline98.com</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

const paragraphs = (text) => String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p dir="auto" style="margin:0 0 16px;font-size:16px;line-height:1.65;color:${C.body};">${esc(p).replace(/\n/g, '<br>')}</p>`)
  .join('');

// Detail rows -> 2-column "ticket" grid (label small caps, value big condensed).
function detailGrid(details) {
  if (!details.length) return '';
  const cell = (d) => {
    const hot = /price|cost|سعر/i.test(d.label);
    return `<td class="cell" width="50%" style="width:50%;padding:6px;vertical-align:top;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.raised};border:1px solid ${C.line};border-left:3px solid ${hot ? C.red : C.line};border-radius:4px;">
        <tr><td style="padding:12px 14px;">
          <div style="font-family:${F.display};font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${C.muted};">${esc(d.label)}</div>
          <div dir="auto" style="margin-top:4px;font-family:${F.display};font-size:24px;line-height:1.1;font-weight:900;text-transform:uppercase;color:${hot ? C.redHot : C.ink};">${esc(d.value)}</div>
        </td></tr>
      </table>
    </td>`;
  };
  const rows = [];
  for (let i = 0; i < details.length; i += 2) {
    rows.push(`<tr>${cell(details[i])}${details[i + 1] ? cell(details[i + 1]) : '<td class="cell" width="50%" style="width:50%;padding:6px;"></td>'}</tr>`);
  }
  return `<tr><td class="px" style="padding:4px 22px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table></td></tr>`;
}

const ctaButton = (text, url) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    <td style="background:${C.red};border-radius:4px;box-shadow:0 6px 0 #7F1D1D;">
      <a href="${esc(url)}" style="display:inline-block;padding:16px 38px;font-family:${F.display};font-size:20px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${esc(text)}&nbsp;&rarr;</a>
    </td>
  </tr></table>`;

/**
 * Trip / marketing campaign.
 * fields: { subject, previewText, kicker, headline, message, details:[{label,value}], imageUrl, ctaText, ctaUrl }
 */
function buildCampaignHtml(f = {}) {
  const img = emailImage(f.imageUrl);
  const cta = safeUrl(f.ctaUrl);
  const details = (Array.isArray(f.details) ? f.details : [])
    .filter((d) => d && String(d.label || '').trim() && String(d.value || '').trim()).slice(0, 8);

  const body = `
    ${img ? `<tr><td style="padding:0;"><a href="${esc(cta || SITE_URL)}"><img src="${esc(img)}" width="600" alt="${esc(f.headline)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>` : ''}
    <tr>
      <td class="px" style="padding:30px 28px 6px;">
        <p style="margin:0 0 10px;font-family:${F.display};font-size:14px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${C.red};">Hey {{ contact.FIRSTNAME | default : "there" }} &#9889;</p>
        <h1 class="h1" dir="auto" style="margin:0 0 18px;font-family:${F.display};font-size:52px;line-height:.95;font-weight:900;text-transform:uppercase;letter-spacing:-.005em;color:${C.ink};">${esc(f.headline)}</h1>
        ${paragraphs(f.message)}
      </td>
    </tr>
    ${detailGrid(details)}
    ${cta && f.ctaText ? `<tr><td align="center" class="px" style="padding:22px 28px 10px;">${ctaButton(f.ctaText, cta)}</td></tr>
    <tr><td align="center" class="px" style="padding:12px 28px 30px;font-family:${F.display};font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${C.muted};">Spots go fast. Don't sleep on it.</td></tr>` : '<tr><td style="padding:14px;"></td></tr>'}`;

  const footer = `
    <p style="margin:0 0 10px;font-family:${F.body};font-size:12px;line-height:1.6;color:${C.muted};">
      <strong style="color:${C.body};">Using Gmail?</strong> Drag this email to your <strong style="color:${C.body};">Primary</strong> tab so you never miss a new trip.
    </p>
    <p style="margin:0;font-family:${F.body};font-size:12px;line-height:1.6;color:${C.faint};">
      You're getting this because you have an Adrenaline account and chose to hear about new trips. Questions? Just reply.<br>
      <a href="{{ unsubscribe }}" style="color:${C.redHot};">Unsubscribe</a> &middot; <a href="${SITE_URL}/profile" style="color:${C.muted};">Email preferences</a>
    </p>`;

  return emailShell({
    lang: 'en', title: f.subject, preheader: f.previewText, kicker: f.kicker, bodyHtml: body, footerHtml: footer,
  });
}

// Default draft for announcing a trip.
function fieldsFromTrip(trip) {
  const id = String(trip._id || trip.id);
  const details = [
    { label: 'Date', value: trip.date && trip.date !== '0000' ? trip.date : '' },
    { label: 'Duration', value: String(trip.durationText || '').replace(/\s+/g, ' ').trim() },
    { label: 'Where', value: trip.location || '' },
    { label: 'Price', value: trip.price ? `EGP ${Number(trip.price).toLocaleString('en-US')}` : '' },
    { label: 'Spots left', value: trip.spotsLeft != null && trip.spotsLeft > 0 ? String(trip.spotsLeft) : '' },
  ].filter((d) => d.value);
  const when = details.find((d) => d.label === 'Date');
  return {
    tripId: id,
    subject: `New trip: ${trip.title}${when ? ` · ${when.value}` : ''}`,
    previewText: `${trip.title} just dropped. Spots are limited, grab yours.`,
    kicker: 'New trip drop',
    headline: trip.title,
    message: [trip.description, 'Bookings are open now. Spots are limited, so lock yours in before they\'re gone.']
      .filter(Boolean).join('\n\n'),
    details,
    imageUrl: trip.image || '',
    ctaText: 'Book your spot',
    ctaUrl: `${SITE_URL}/trips/${id}`,
  };
}

module.exports = { buildCampaignHtml, fieldsFromTrip, emailShell, chip, safeUrl, esc, SITE_URL, C, F };
