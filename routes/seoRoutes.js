// robots.txt and sitemap.xml, so search engines can find every public page.
const fs = require('fs');
const path = require('path');
const express = require('express');
const Trip = require('../models/Trip');

const router = express.Router();
const SITE_URL = (process.env.SITE_URL || 'https://adrenaline98.com').replace(/\/+$/, '');

// Every page gets the absolute site URL and its own path, for canonical and share tags.
router.use((req, res, next) => {
  res.locals.siteUrl = SITE_URL;
  res.locals.canonicalPath = req.path;
  next();
});

// Signed-in, booking and admin pages are never useful in search results.
const PRIVATE_PATHS = ['/admin', '/api/', '/dashboard', '/profile', '/my-bookings', '/booking/', '/reviews/write', '/custom-trip', '/photo-book', '/avatars/'];

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    ['User-agent: *', 'Allow: /', ...PRIVATE_PATHS.map((p) => 'Disallow: ' + p), '', `Sitemap: ${SITE_URL}/sitemap.xml`, ''].join('\n')
  );
});

const STATIC_PAGES = [
  ['/', 'daily', '1.0'],
  ['/trips/upcoming', 'daily', '0.9'],
  ['/packages/day', 'weekly', '0.8'],
  ['/packages/week', 'weekly', '0.8'],
  ['/packages/single', 'weekly', '0.8'],
  ['/trips/past', 'weekly', '0.6'],
  ['/about', 'monthly', '0.6'],
  ['/faq', 'monthly', '0.5'],
  ['/contact', 'monthly', '0.5'],
  ['/privacy', 'yearly', '0.2'],
  ['/terms', 'yearly', '0.2'],
];

function cityGuideSlugs() {
  try {
    return fs.readdirSync(path.join(__dirname, '..', 'public', 'images', 'city-guides'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (_) {
    return [];
  }
}

const xmlEscape = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

let cache = { xml: '', at: 0 };
const CACHE_MS = 60 * 60 * 1000;

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    if (!cache.xml || Date.now() - cache.at > CACHE_MS) {
      const trips = await Trip.find({ status: 'active' }).select('_id kind updatedAt').sort('-updatedAt').lean();
      const urls = [
        ...STATIC_PAGES.map(([loc, changefreq, priority]) => ({ loc, changefreq, priority })),
        ...trips.map((t) => ({
          loc: `/trips/${t._id}`,
          lastmod: t.updatedAt ? new Date(t.updatedAt).toISOString().slice(0, 10) : null,
          changefreq: t.kind === 'upcoming' ? 'daily' : 'monthly',
          priority: t.kind === 'upcoming' ? '0.9' : '0.5',
        })),
        ...cityGuideSlugs().map((slug) => ({ loc: `/city-guides/${slug}`, changefreq: 'monthly', priority: '0.5' })),
      ];
      cache = {
        at: Date.now(),
        xml: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + urls.map((u) => `  <url><loc>${xmlEscape(SITE_URL + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')
          + '\n</urlset>\n',
      };
    }
    res.type('application/xml').send(cache.xml);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
