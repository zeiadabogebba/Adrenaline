// Marketing email HTML (Brevo campaigns). Table layout + inline styles so it
// renders the same in Gmail, Outlook and Apple Mail. All admin text is escaped.
const SITE_URL = (process.env.SITE_URL || 'https://adrenaline98.com').replace(/\/+$/, '');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const safeUrl = (u) => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

// Cloudinary: serve a resized copy so the email stays light.
function emailImage(url) {
  const u = safeUrl(url);
  if (!u) return '';
  return u.includes('res.cloudinary.com') && u.includes('/upload/') && !u.includes('/upload/w_')
    ? u.replace('/upload/', '/upload/w_1200,c_limit,q_auto/')
    : u;
}

const paragraphs = (text) => String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p dir="auto" style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#27272a;">${esc(p).replace(/\n/g, '<br>')}</p>`)
  .join('');

/**
 * fields: { subject, previewText, headline, message, details:[{label,value}],
 *           imageUrl, ctaText, ctaUrl }
 */
function buildCampaignHtml(f = {}) {
  const img = emailImage(f.imageUrl);
  const cta = safeUrl(f.ctaUrl);
  const details = (Array.isArray(f.details) ? f.details : [])
    .filter((d) => d && String(d.label || '').trim() && String(d.value || '').trim()).slice(0, 8);

  const detailRows = details.map((d) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#71717a;width:40%;">${esc(d.label)}</td>
                <td dir="auto" style="padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:15px;font-weight:600;color:#18181b;text-align:right;">${esc(d.value)}</td>
              </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${esc(f.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(f.previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0a0a0b;padding:18px 28px;">
            <a href="${SITE_URL}" style="text-decoration:none;font-size:20px;font-weight:800;letter-spacing:.12em;color:#ffffff;">ADRENALINE<span style="color:#dc2626;">.</span></a>
          </td>
        </tr>
        ${img ? `<tr><td style="padding:0;"><a href="${esc(cta || SITE_URL)}"><img src="${esc(img)}" width="600" alt="${esc(f.headline)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>` : ''}
        <tr>
          <td style="padding:32px 28px 8px;">
            <h1 dir="auto" style="margin:0 0 8px;font-size:28px;line-height:1.2;color:#0a0a0b;">${esc(f.headline)}</h1>
            <p style="margin:0 0 20px;font-size:15px;color:#71717a;">Hi {{ contact.FIRSTNAME | default : "there" }},</p>
            ${paragraphs(f.message)}
          </td>
        </tr>
        ${detailRows ? `<tr><td style="padding:0 28px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows}</table></td></tr>` : ''}
        ${cta && f.ctaText ? `
        <tr>
          <td align="center" style="padding:28px 28px 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="background:#dc2626;border-radius:8px;">
                <a href="${esc(cta)}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(f.ctaText)}</a>
              </td>
            </tr></table>
          </td>
        </tr>` : '<tr><td style="padding:12px;"></td></tr>'}
        <tr>
          <td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:20px 28px;font-size:12px;line-height:1.6;color:#71717a;">
            <strong style="color:#3f3f46;">Using Gmail?</strong> Drag this email to your <strong style="color:#3f3f46;">Primary</strong> tab so you never miss a new trip.<br><br>
            You're receiving this because you have an account on <a href="${SITE_URL}" style="color:#71717a;">adrenaline98.com</a> and chose to hear about new trips.
            Questions? Just reply to this email.<br>
            <a href="{{ unsubscribe }}" style="color:#dc2626;">Unsubscribe</a> &middot;
            <a href="${SITE_URL}/profile" style="color:#71717a;">Email preferences</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
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
    previewText: `${trip.title} is open for booking. Spots are limited.`,
    headline: trip.title,
    message: [trip.description, 'Bookings are open now on the website. Spots are limited, so reserve yours early.']
      .filter(Boolean).join('\n\n'),
    details,
    imageUrl: trip.image || '',
    ctaText: 'Book your spot',
    ctaUrl: `${SITE_URL}/trips/${id}`,
  };
}

module.exports = { buildCampaignHtml, fieldsFromTrip, safeUrl, SITE_URL };
