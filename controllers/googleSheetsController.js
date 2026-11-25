const crypto = require('crypto');
const mongoose = require('mongoose');
const sheets = require('../utils/googleSheets');
const AppError = require('../utils/AppError');

const STATE_COOKIE = 'gsheets_state';

// GET /admin/google-sheets/connect: sends the admin to Google's consent screen.
const connect = (req, res, next) => {
  if (!sheets.isConfigured()) {
    return next(new AppError('Google Sheets is not set up: GOOGLE_CLIENT_SECRET is missing on the server.', 503));
  }
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: 10 * 60 * 1000,
    path: '/admin/google-sheets',
  });
  res.redirect(sheets.authUrl(state));
};

// GET /admin/google-sheets/callback: Google sends the admin back here.
const callback = async (req, res) => {
  const expected = req.cookies && req.cookies[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: '/admin/google-sheets' });
  const back = (result) => res.redirect('/admin/bookings?sheets=' + result);

  if (req.query.error) return back('cancelled');
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!expected || !state || state.length !== expected.length
      || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
    return back('error');
  }
  try {
    await sheets.connect(String(req.query.code || ''));
  } catch (err) {
    console.error('[google-sheets] connect failed:', err.message);
    return back(String(err.message).includes('Drive access') ? 'noscope' : 'error');
  }
  // Fill in sheets for the upcoming trips in the background.
  sheets.syncAll().catch((err) => console.error('[google-sheets] first sync failed:', err.message));
  back('connected');
};

const status = async (req, res, next) => {
  try {
    res.status(200).json({ status: 'success', data: await sheets.getStatus() });
  } catch (err) {
    next(err);
  }
};

const disconnect = async (req, res, next) => {
  try {
    await sheets.disconnect();
    res.status(200).json({ status: 'success' });
  } catch (err) {
    next(err);
  }
};

let fullSyncRunning = false;
const syncAll = async (req, res, next) => {
  const st = await sheets.getStatus().catch(() => ({}));
  if (!st.connected) return next(new AppError('Google Sheets is not connected.', 400));
  if (fullSyncRunning) return next(new AppError('A sync is already running. Try again in a minute.', 409));
  fullSyncRunning = true;
  try {
    const result = await sheets.syncAll();
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    console.error('[google-sheets] full sync failed:', err.message);
    next(new AppError(err.reconnect ? 'Google access was revoked. Please reconnect Google Sheets.' : 'Sync with Google Sheets failed. Please try again later.', 502));
  } finally {
    fullSyncRunning = false;
  }
};

// POST /api/admin/google-sheets/trip/:tripId: syncs one trip now and returns its sheet link.
const syncTrip = async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.tripId)) return next(new AppError('Trip not found.', 404));
  const st = await sheets.getStatus().catch(() => ({}));
  if (!st.connected) return next(new AppError('Google Sheets is not connected.', 400));
  try {
    const result = await sheets.syncTripNow(req.params.tripId);
    if (!result) return next(new AppError('Trip not found.', 404));
    res.status(200).json({ status: 'success', data: { url: result.url, rows: result.rows } });
  } catch (err) {
    console.error('[google-sheets] trip sync failed:', err.message);
    next(new AppError(err.reconnect ? 'Google access was revoked. Please reconnect Google Sheets.' : 'Could not update the Google Sheet. Please try again.', 502));
  }
};

module.exports = { connect, callback, status, disconnect, syncAll, syncTrip };
