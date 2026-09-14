// Initials avatars served from our own origin (replaces ui-avatars.com, which some
// phones and networks block).

const escapeXml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// "Zeiad Abogebba" -> "ZA", same as ui-avatars: first letter of the first two words.
const initialsOf = (name) => String(name || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => Array.from(word)[0])
  .join('')
  .toUpperCase() || '?';

const initialsAvatar = (req, res) => {
  const text = escapeXml(initialsOf(req.query.name));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">`
    + `<rect width="128" height="128" fill="#DC2626"/>`
    + `<text x="64" y="64" dy="0.35em" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="52" font-weight="600">${text}</text>`
    + `</svg>`;

  res.set({
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=604800',
    // Opened directly, the SVG must never be able to run anything.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.send(svg);
};

module.exports = { initialsAvatar };
