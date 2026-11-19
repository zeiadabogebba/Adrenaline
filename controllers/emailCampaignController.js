const mongoose = require('mongoose');
const EmailCampaign = require('../models/EmailCampaign');
const Trip = require('../models/Trip');
const AppError = require('../utils/AppError');
const brevo = require('../utils/brevo');
const templates = require('../utils/emailTemplateStore');
const { buildCampaignHtml, fieldsFromTrip, safeUrl, previewName } = require('../utils/emailTemplate');

const DAILY_LIMIT = Number(process.env.BREVO_DAILY_LIMIT || 300); // Brevo free plan
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// Only the editable fields, trimmed; URLs must be https.
function pickFields(body = {}) {
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const f = {
    subject: str(body.subject, 150),
    previewText: str(body.previewText, 200),
    kicker: str(body.kicker, 30),
    headline: str(body.headline, 150),
    message: String(body.message == null ? '' : body.message).slice(0, 5000),
    details: (Array.isArray(body.details) ? body.details : []).slice(0, 8)
      .map((d) => ({ label: str(d && d.label, 40), value: str(d && d.value, 120) }))
      .filter((d) => d.label && d.value),
    imageUrl: str(body.imageUrl, 600),
    ctaText: str(body.ctaText, 40),
    ctaUrl: str(body.ctaUrl, 600),
    tripId: body.tripId && isId(body.tripId) ? body.tripId : null,
  };
  if (!f.subject) throw new AppError('Please add a subject line.', 400);
  if (f.imageUrl && !safeUrl(f.imageUrl)) throw new AppError('The image link must start with https://', 400);
  if (f.ctaUrl && !safeUrl(f.ctaUrl)) throw new AppError('The button link must start with https://', 400);
  if (f.ctaText && !f.ctaUrl) throw new AppError('Add a link for the button, or clear the button text.', 400);
  return f;
}

const requireBrevo = () => {
  if (!brevo.isEnabled()) throw new AppError('Brevo is not connected: BREVO_API_KEY is missing on the server.', 503);
};

// Create or refresh the Brevo campaign so it matches the saved fields exactly.
async function pushToBrevo(doc) {
  const payload = { name: doc.subject, subject: doc.subject, previewText: doc.previewText, htmlContent: buildCampaignHtml(doc, await templates.getTrip()) };
  if (doc.brevoId) {
    await brevo.updateCampaign(doc.brevoId, payload);
  } else {
    doc.brevoId = await brevo.createCampaign(payload);
    await doc.save();
  }
}

const brevoFailed = (err, what) => {
  console.error(`[brevo] ${what} failed:`, err.message);
  return new AppError(`Brevo could not ${what}. Please try again in a moment.`, 502);
};

// GET /api/admin/emails
const listCampaigns = async (req, res, next) => {
  try {
    const [campaigns, trips, listSize] = await Promise.all([
      EmailCampaign.find().sort('-updatedAt').limit(50).lean(),
      Trip.find({ kind: 'upcoming' }, 'title date status').sort('-createdAt').lean(),
      brevo.isEnabled() ? brevo.getListSize().catch(() => null) : null,
    ]);
    await Promise.all(campaigns.filter((c) => c.status !== 'draft' && c.brevoId).map(async (c) => {
      try { c.brevo = await brevo.getCampaign(c.brevoId); } catch (_) { c.brevo = null; }
    }));
    res.status(200).json({ status: 'success', data: { campaigns, trips, listSize, enabled: brevo.isEnabled(), dailyLimit: DAILY_LIMIT } });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/emails/:id
const getCampaign = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return next(new AppError('Email not found.', 404));
    const doc = await EmailCampaign.findById(req.params.id).lean();
    if (!doc) return next(new AppError('Email not found.', 404));
    res.status(200).json({ status: 'success', data: doc });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/emails/trip/:tripId  -> default announcement fields
const tripDefaults = async (req, res, next) => {
  try {
    if (!isId(req.params.tripId)) return next(new AppError('Trip not found.', 404));
    const trip = await Trip.findById(req.params.tripId).lean();
    if (!trip) return next(new AppError('Trip not found.', 404));
    res.status(200).json({ status: 'success', data: fieldsFromTrip(trip, await templates.getTrip()) });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/emails/preview
const preview = async (req, res, next) => {
  try {
    const f = pickFields({ subject: '(no subject)', ...req.body, subject: req.body.subject || '(no subject)' });
    res.status(200).json({ status: 'success', data: { html: previewName(buildCampaignHtml(f, await templates.getTrip()), req.user.name) } });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/emails
const createDraft = async (req, res, next) => {
  try {
    const doc = await EmailCampaign.create({ ...pickFields(req.body), createdBy: req.user._id });
    res.status(201).json({ status: 'success', data: doc });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/emails/:id
const updateDraft = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return next(new AppError('Email not found.', 404));
    const doc = await EmailCampaign.findById(req.params.id);
    if (!doc) return next(new AppError('Email not found.', 404));
    if (doc.status !== 'draft') return next(new AppError('This email was already sent and can no longer be edited.', 400));
    Object.assign(doc, pickFields(req.body));
    await doc.save();
    res.status(200).json({ status: 'success', data: doc });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/emails/:id  (drafts only)
const deleteDraft = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return next(new AppError('Email not found.', 404));
    const doc = await EmailCampaign.findById(req.params.id);
    if (!doc) return next(new AppError('Email not found.', 404));
    if (doc.status !== 'draft') return next(new AppError('Sent emails are kept for your records.', 400));
    if (doc.brevoId && brevo.isEnabled()) await brevo.deleteCampaign(doc.brevoId).catch(() => {});
    await doc.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/emails/:id/test  { emails: [..] }
const sendTest = async (req, res, next) => {
  try {
    requireBrevo();
    if (!isId(req.params.id)) return next(new AppError('Email not found.', 404));
    const emails = [...new Set((Array.isArray(req.body.emails) ? req.body.emails : [])
      .map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) return next(new AppError('Add at least one test address.', 400));
    if (emails.length > 10) return next(new AppError('Send a test to 10 addresses at most.', 400));
    const bad = emails.find((e) => !EMAIL_RE.test(e));
    if (bad) return next(new AppError(`"${bad}" is not a valid email address.`, 400));

    const doc = await EmailCampaign.findById(req.params.id);
    if (!doc) return next(new AppError('Email not found.', 404));
    if (doc.status !== 'draft') return next(new AppError('This email was already sent.', 400));

    try {
      await pushToBrevo(doc);
      await brevo.sendCampaignTest(doc.brevoId, emails);
    } catch (err) {
      return next(brevoFailed(err, 'send the test email'));
    }
    doc.testSentTo = emails;
    doc.testSentAt = new Date();
    await doc.save();
    res.status(200).json({ status: 'success', data: doc });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/emails/:id/send  { confirm: true }
const sendToAll = async (req, res, next) => {
  try {
    requireBrevo();
    if (!isId(req.params.id)) return next(new AppError('Email not found.', 404));
    if (req.body.confirm !== true) return next(new AppError('Please confirm before sending.', 400));

    let listSize;
    try { listSize = await brevo.getListSize(); } catch (err) { return next(brevoFailed(err, 'load the subscriber list')); }
    if (!listSize) return next(new AppError('The subscriber list is empty.', 400));
    if (listSize > DAILY_LIMIT) {
      return next(new AppError(`The list has ${listSize} subscribers but your Brevo plan allows ${DAILY_LIMIT} emails a day. Upgrade Brevo before sending.`, 400));
    }

    // Claim the draft atomically so a double click can't send twice.
    const doc = await EmailCampaign.findOneAndUpdate({ _id: req.params.id, status: 'draft' }, { status: 'sending' }, { new: true });
    if (!doc) return next(new AppError('This email was already sent or is being sent.', 409));

    try {
      await pushToBrevo(doc);
      await brevo.sendCampaignNow(doc.brevoId);
    } catch (err) {
      await EmailCampaign.updateOne({ _id: doc._id }, { status: 'draft' });
      return next(brevoFailed(err, 'send the email'));
    }
    doc.status = 'sent';
    doc.sentAt = new Date();
    doc.sentCount = listSize;
    await doc.save();
    res.status(200).json({ status: 'success', data: doc });
  } catch (err) {
    next(err);
  }
};

module.exports = { listCampaigns, getCampaign, tripDefaults, preview, createDraft, updateDraft, deleteDraft, sendTest, sendToAll };
