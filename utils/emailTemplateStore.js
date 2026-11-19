// Admin-editable wording for the two branded emails (login code + trip
// announcement). Saved in AppSetting 'emailTemplates'; anything missing or
// blank falls back to the built-in defaults, and a DB problem never blocks a
// login-code email (it just uses the defaults).
const AppSetting = require('../models/AppSetting');
const { translate } = require('./i18n');

const KEY = 'emailTemplates';
const LANGS = ['en', 'ar'];
const CACHE_MS = 60 * 1000;

// field -> { max, required, multiline }
const SPECS = {
  otp: {
    subject:  { max: 150, required: true },
    kicker:   { max: 30 },
    title:    { max: 80, required: true },
    greeting: { max: 80, required: true },
    intro:    { max: 600, required: true, multiline: true },
    expiry:   { max: 600, required: true, multiline: true },
  },
  trip: {
    subject:     { max: 150, required: true },
    previewText: { max: 200 },
    kicker:      { max: 30 },
    closing:     { max: 600, multiline: true },
    ctaText:     { max: 40, required: true },
    greeting:    { max: 80 },
    urgency:     { max: 120 },
    gmailTip:    { max: 300, multiline: true },
  },
};

const otpDefaults = (lang) => {
  const t = (k) => translate(lang, `email.${k}`);
  return {
    subject: t('subject'), kicker: lang === 'ar' ? '' : 'Verification', title: t('title'),
    greeting: t('greeting'), intro: t('intro'), expiry: t('expiry'),
  };
};

const TRIP_DEFAULTS = {
  subject: 'New trip: {title} · {date}',
  previewText: '{title} just dropped. Spots are limited, grab yours.',
  kicker: 'New trip drop',
  closing: "Bookings are open now. Spots are limited, so lock yours in before they're gone.",
  ctaText: 'Book your spot',
  greeting: 'Hey {name} ⚡',
  urgency: "Spots go fast. Don't sleep on it.",
  gmailTip: 'Using Gmail? Drag this email to your Primary tab so you never miss a new trip.',
};

const defaults = () => ({
  otp: Object.fromEntries(LANGS.map((l) => [l, otpDefaults(l)])),
  trip: { ...TRIP_DEFAULTS },
});

// Saved values over defaults; required fields can't end up blank.
function merge(spec, base, saved) {
  const out = { ...base };
  if (!saved || typeof saved !== 'object') return out;
  for (const [k, s] of Object.entries(spec)) {
    const v = saved[k];
    if (typeof v !== 'string') continue;
    if (s.required && !v.trim()) continue;
    out[k] = v;
  }
  return out;
}

let cache = null;
let cacheAt = 0;

async function loadSaved() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  try {
    const doc = await AppSetting.findOne({ key: KEY }).lean().maxTimeMS(3000);
    cache = (doc && doc.value) || {};
    cacheAt = Date.now();
  } catch (err) {
    console.error('[emailTemplates] load failed, using defaults:', err.message);
    if (!cache) return {};
  }
  return cache;
}

async function getOtp(lang) {
  const l = LANGS.includes(lang) ? lang : 'en';
  const saved = await loadSaved().catch(() => ({}));
  return merge(SPECS.otp, otpDefaults(l), saved.otp && saved.otp[l]);
}

async function getTrip() {
  const saved = await loadSaved().catch(() => ({}));
  return merge(SPECS.trip, TRIP_DEFAULTS, saved.trip);
}

async function getAll() {
  const saved = await loadSaved();
  const d = defaults();
  return {
    otp: Object.fromEntries(LANGS.map((l) => [l, merge(SPECS.otp, d.otp[l], saved.otp && saved.otp[l])])),
    trip: merge(SPECS.trip, d.trip, saved.trip),
    customized: { otp: !!saved.otp, trip: !!saved.trip },
    defaults: d,
  };
}

const LABELS = {
  subject: 'Subject line', previewText: 'Preview text', kicker: 'Tag', title: 'Top line', greeting: 'Greeting',
  intro: 'Message', expiry: 'Small print', closing: 'Closing line', ctaText: 'Button text', urgency: 'Line under the button', gmailTip: 'Footer tip',
};

// Validates admin input for one template. Throws { message } on bad input.
function clean(key, body) {
  const spec = SPECS[key];
  const one = (src = {}, label) => {
    const out = {};
    for (const [k, s] of Object.entries(spec)) {
      const v = String(src[k] == null ? '' : src[k]).replace(/\r\n/g, '\n');
      const val = s.multiline ? v.trim() : v.replace(/\s+/g, ' ').trim();
      if (val.length > s.max) throw new Error(`${label}${LABELS[k] || k} is too long (max ${s.max} characters).`);
      if (s.required && !val) throw new Error(`${label}${LABELS[k] || k} can't be empty.`);
      out[k] = val;
    }
    return out;
  };
  if (key === 'otp') {
    return Object.fromEntries(LANGS.map((l) => [l, one((body || {})[l], l === 'ar' ? 'Arabic: ' : 'English: ')]));
  }
  return one(body, '');
}

async function save(key, value) {
  const doc = await AppSetting.findOne({ key: KEY });
  const next = { ...((doc && doc.value) || {}) };
  if (value == null) delete next[key]; else next[key] = value;
  await AppSetting.updateOne({ key: KEY }, { $set: { value: next } }, { upsert: true });
  cache = next;
  cacheAt = Date.now();
}

// "{x}" -> vars.x; unknown placeholders are left as typed.
const fill = (text, vars) => String(text || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

module.exports = { SPECS, LANGS, TRIP_DEFAULTS, otpDefaults, getOtp, getTrip, getAll, clean, save, fill, merge };
