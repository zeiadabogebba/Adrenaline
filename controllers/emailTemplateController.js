const Trip = require('../models/Trip');
const AppError = require('../utils/AppError');
const templates = require('../utils/emailTemplateStore');
const { buildCampaignHtml, fieldsFromTrip, previewName } = require('../utils/emailTemplate');
const { otpEmailHtml, sendOtpEmail } = require('../utils/email');

const KEYS = ['otp', 'trip'];
const SAMPLE_CODE = '000000';

const checkKey = (key) => {
  if (!KEYS.includes(key)) throw new AppError('Unknown template.', 404);
};

// Validation errors from the store become 400s.
const cleanOr400 = (key, body) => {
  try { return templates.clean(key, body); } catch (err) { throw new AppError(err.message, 400); }
};

// A recent upcoming trip for the trip preview, or a made-up one.
async function sampleTrip() {
  const trip = await Trip.findOne({ kind: 'upcoming', status: 'active' }).sort('-createdAt').lean().catch(() => null);
  return trip || {
    _id: '000000000000000000000000', title: 'Sunrise Hike to Mount Sinai', date: '12 Dec',
    durationText: '2 days', location: 'South Sinai', price: 3500, spotsLeft: 12,
    description: 'Climb under the stars and catch the sunrise from the summit with the crew.',
  };
}

// GET /api/admin/email-templates
const list = async (req, res, next) => {
  try {
    res.status(200).json({ status: 'success', data: { ...(await templates.getAll()), specs: templates.SPECS } });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/email-templates/:key/preview   otp: { lang, en:{..}, ar:{..} } | trip: {..}
const preview = async (req, res, next) => {
  try {
    checkKey(req.params.key);
    const body = req.body || {};
    if (req.params.key === 'otp') {
      const lang = body.lang === 'ar' ? 'ar' : 'en';
      const tpl = templates.merge(templates.SPECS.otp, templates.otpDefaults(lang), body[lang]);
      const html = otpEmailHtml({ name: req.user.name, otp: SAMPLE_CODE, expiresMinutes: 10, lang, tpl });
      return res.status(200).json({ status: 'success', data: { html, subject: templates.fill(tpl.subject, { otp: SAMPLE_CODE }) } });
    }
    const tpl = templates.merge(templates.SPECS.trip, templates.TRIP_DEFAULTS, body);
    const fields = fieldsFromTrip(await sampleTrip(), tpl);
    res.status(200).json({ status: 'success', data: { html: previewName(buildCampaignHtml(fields, tpl), req.user.name), subject: fields.subject } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/email-templates/:key
const update = async (req, res, next) => {
  try {
    checkKey(req.params.key);
    await templates.save(req.params.key, cleanOr400(req.params.key, req.body));
    res.status(200).json({ status: 'success', data: await templates.getAll() });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/email-templates/:key  -> back to the built-in wording
const reset = async (req, res, next) => {
  try {
    checkKey(req.params.key);
    await templates.save(req.params.key, null);
    res.status(200).json({ status: 'success', data: await templates.getAll() });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/email-templates/otp/test  { lang, en, ar } -> sends the
// (unsaved) wording to the signed-in admin with a dummy code.
const testOtp = async (req, res, next) => {
  try {
    const lang = req.body && req.body.lang === 'ar' ? 'ar' : 'en';
    const tpl = cleanOr400('otp', req.body)[lang];
    const sent = await sendOtpEmail({ to: req.user.email, name: req.user.name, otp: SAMPLE_CODE, expiresMinutes: 10, lang, tpl });
    if (!sent) return next(new AppError('No email service is configured on the server.', 503));
    res.status(200).json({ status: 'success', data: { to: req.user.email } });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, preview, update, reset, testOtp };
