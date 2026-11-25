// Google Sheets integration: keeps one spreadsheet per trip, in the connected
// Google account's Drive, in step with that trip's live bookings.
//
// Each spreadsheet has two tabs:
//   "Bookings" - rewritten by the website on every sync (Name, Phone, Booking ID)
//   "Notes"    - never touched by the website after it is created
//
// Everything here is best-effort: if Google is down, the account is
// disconnected or the env vars are missing, bookings keep working and the
// admin "Sync now" button catches up later. Nothing in here writes to bookings.
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const AppSetting = require('../models/AppSetting');
const Booking = require('../models/Booking');
const Trip = require('../models/Trip');

const SETTINGS_KEY = 'googleSheets';
const TRIP_KEY_PREFIX = 'googleSheets.trip.';
// drive.file only reaches files this app created, so the website never sees the rest of the Drive.
const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'];
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const ROSTER_TAB = 'Bookings';
const NOTES_TAB = 'Notes';
const ROSTER_SHEET_ID = 0;
const NOTES_SHEET_ID = 1;
const HEADER = ['Name', 'Phone', 'Booking ID'];

const siteUrl = () => (process.env.SITE_URL || 'https://adrenaline98.com').replace(/\/+$/, '');
const redirectUri = () => `${siteUrl()}/admin/google-sheets/callback`;

const isConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function newClient() {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri(),
  });
}

// ── Refresh token at rest: AES-256-GCM with a key derived from JWT_SECRET ──
function cipherKey() {
  return crypto.createHash('sha256').update('google-sheets:' + (process.env.JWT_SECRET || '')).digest();
}
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  const [iv, tag, data] = String(blob).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

async function getSettings() {
  const doc = await AppSetting.findOne({ key: SETTINGS_KEY }).lean();
  return (doc && doc.value) || {};
}
async function patchSettings(patch) {
  const $set = {};
  Object.entries(patch).forEach(([k, v]) => { $set['value.' + k] = v; });
  await AppSetting.updateOne({ key: SETTINGS_KEY }, { $set }, { upsert: true });
}

// ── Connect / disconnect ──
function authUrl(state) {
  return newClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // always hand back a refresh token, even on a reconnect
    scope: SCOPES,
    state,
    login_hint: 'adrenaline98@gmail.com',
    include_granted_scopes: false,
  });
}

let cachedClient = null;

async function connect(code) {
  const client = newClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error('Google did not return a refresh token.');
  if (!String(tokens.scope || '').includes('drive.file')) {
    throw new Error('Google Drive access was not granted. Please tick the permission box on the Google screen.');
  }
  let email = '';
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    email = ticket.getPayload().email || '';
  }
  await AppSetting.updateOne(
    { key: SETTINGS_KEY },
    { $set: { value: { refreshToken: encrypt(tokens.refresh_token), email, connectedAt: new Date(), lastSync: null, lastError: '' } } },
    { upsert: true }
  );
  cachedClient = null;
  return { email };
}

async function disconnect() {
  const settings = await getSettings();
  cachedClient = null;
  await AppSetting.deleteOne({ key: SETTINGS_KEY });
  // Trip → spreadsheet links are kept: reconnecting the same account reuses the same files.
  if (settings.refreshToken) {
    try { await newClient().revokeToken(decrypt(settings.refreshToken)); } catch (_) { /* already revoked */ }
  }
}

async function authedClient() {
  if (cachedClient) return cachedClient;
  const settings = await getSettings();
  if (!settings.refreshToken) return null;
  const client = newClient();
  client.setCredentials({ refresh_token: decrypt(settings.refreshToken) });
  cachedClient = client;
  return client;
}

async function getStatus() {
  const s = await getSettings();
  return {
    configured: isConfigured(),
    connected: Boolean(s.refreshToken),
    email: s.email || '',
    connectedAt: s.connectedAt || null,
    lastSync: s.lastSync || null,
    lastError: s.lastError || '',
  };
}

// ── Sheets API calls ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(client, method, url, data) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await client.request({ method, url, data, timeout: 20000 });
      return res.data;
    } catch (err) {
      const status = err.response && err.response.status;
      // Rate limit (60 writes/min) or a Google hiccup: back off and retry a few times.
      if ((status === 429 || status >= 500) && attempt < 4) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (String(err.message).includes('invalid_grant')) {
        err.reconnect = true;
        cachedClient = null;
      }
      throw err;
    }
  }
}

const sheetTitle = (trip) => `${trip.title}${trip.date ? ' · ' + trip.date : ''} — Bookings`;
const sheetUrl = (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

async function createSpreadsheet(client, trip) {
  const created = await api(client, 'POST', SHEETS_API, {
    properties: { title: sheetTitle(trip) },
    sheets: [
      { properties: { sheetId: ROSTER_SHEET_ID, title: ROSTER_TAB, index: 0, gridProperties: { frozenRowCount: 1 } } },
      { properties: { sheetId: NOTES_SHEET_ID, title: NOTES_TAB, index: 1 } },
    ],
  });
  const id = created.spreadsheetId;

  await api(client, 'POST', `${SHEETS_API}/${id}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: [{
      range: `${NOTES_TAB}!A1:A2`,
      values: [['Notes'], ['Write anything here. The website never changes this tab.']],
    }],
  });
  await api(client, 'POST', `${SHEETS_API}/${id}:batchUpdate`, {
    requests: [
      { repeatCell: { range: { sheetId: ROSTER_SHEET_ID, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
      { repeatCell: { range: { sheetId: NOTES_SHEET_ID, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
      // Phones stay text, so a leading + or 0 is never dropped.
      { repeatCell: { range: { sheetId: ROSTER_SHEET_ID, startColumnIndex: 0, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } },
      { updateDimensionProperties: { range: { sheetId: ROSTER_SHEET_ID, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 240 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId: ROSTER_SHEET_ID, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 }, properties: { pixelSize: 160 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId: NOTES_SHEET_ID, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 600 }, fields: 'pixelSize' } },
      // Edits to the Bookings tab would be wiped by the next sync, so Sheets warns before allowing one.
      { addProtectedRange: { protectedRange: { range: { sheetId: ROSTER_SHEET_ID }, description: 'Filled in by the website on every booking change. Edits here are overwritten; use the Notes tab instead.', warningOnly: true } } },
    ],
  });
  return id;
}

// One row per traveller on the trip's live bookings, same as the CSV export.
async function rosterRows(tripId) {
  const bookings = await Booking.find({ tripId, status: { $nin: ['draft', 'cancelled'] } })
    .populate('userId', 'name phone')
    .select('bookingNumber userId userEmail travellerDetails')
    .sort('createdAt')
    .lean();
  const rows = [];
  bookings.forEach((b) => {
    const travellers = (b.travellerDetails || []).filter((t) => t.name || t.phone);
    if (travellers.length) {
      travellers.forEach((t) => rows.push([t.name || '', t.phone || '', b.bookingNumber || '']));
    } else {
      rows.push([b.userId ? b.userId.name || '' : b.userEmail || '', b.userId ? b.userId.phone || '' : '', b.bookingNumber || '']);
    }
  });
  return rows;
}

async function getTripLink(tripId) {
  const doc = await AppSetting.findOne({ key: TRIP_KEY_PREFIX + tripId }).lean();
  return doc && doc.value && doc.value.spreadsheetId ? doc.value : null;
}

async function syncTripNow(tripId) {
  const client = await authedClient();
  if (!client) throw new Error('Google Sheets is not connected.');
  const trip = await Trip.findById(tripId).select('title date').lean();
  if (!trip) return null;

  const title = sheetTitle(trip);
  let link = await getTripLink(tripId);

  if (link) {
    try {
      // A cheap read that also tells us the file still exists and is reachable.
      const meta = await api(client, 'GET', `${SHEETS_API}/${link.spreadsheetId}?fields=properties.title`);
      if (meta.properties.title !== title) {
        await api(client, 'POST', `${SHEETS_API}/${link.spreadsheetId}:batchUpdate`, {
          requests: [{ updateSpreadsheetProperties: { properties: { title }, fields: 'title' } }],
        });
      }
    } catch (err) {
      const status = err.response && err.response.status;
      if (status !== 404 && status !== 403) throw err;
      link = null; // the file was deleted (or belongs to another account): make a fresh one
    }
  }

  if (!link) {
    const spreadsheetId = await createSpreadsheet(client, trip);
    link = { spreadsheetId, url: sheetUrl(spreadsheetId) };
    await AppSetting.updateOne(
      { key: TRIP_KEY_PREFIX + tripId },
      { $set: { value: { ...link, createdAt: new Date() } } },
      { upsert: true }
    );
  }

  const rows = await rosterRows(tripId);
  await api(client, 'POST', `${SHEETS_API}/${link.spreadsheetId}/values/${encodeURIComponent(ROSTER_TAB)}:clear`, {});
  await api(client, 'POST', `${SHEETS_API}/${link.spreadsheetId}/values:batchUpdate`, {
    // RAW: nothing a customer typed is ever read as a formula.
    valueInputOption: 'RAW',
    data: [{ range: `${ROSTER_TAB}!A1`, values: [HEADER, ...rows] }],
  });

  return { ...link, rows: rows.length };
}

// ── Background queue: one sync per trip at a time, bursts collapse into one ──
const pending = new Map(); // tripId -> timer
const running = new Set();
const rerun = new Set();

function queueTripSync(tripId) {
  if (!tripId || !isConfigured()) return;
  const id = String(tripId);
  if (running.has(id)) { rerun.add(id); return; }
  clearTimeout(pending.get(id));
  pending.set(id, setTimeout(() => runQueued(id), 3000));
}

async function runQueued(id) {
  pending.delete(id);
  running.add(id);
  try {
    const status = await getStatus();
    if (status.connected) {
      await syncTripNow(id);
      await patchSettings({ lastSync: new Date(), lastError: '' });
    }
  } catch (err) {
    console.error(`[google-sheets] sync for trip ${id} failed:`, err.message);
    try {
      await patchSettings({ lastError: err.reconnect ? 'Google access was revoked. Please reconnect.' : 'Last background sync failed. Use "Sync now" to retry.' });
    } catch (_) { /* nothing more to do */ }
  } finally {
    running.delete(id);
    if (rerun.delete(id)) queueTripSync(id);
  }
}

// Every upcoming trip, plus every trip that already has a sheet.
async function syncAll() {
  const [upcoming, linked] = await Promise.all([
    Trip.find({ kind: 'upcoming' }).select('_id').lean(),
    AppSetting.find({ key: new RegExp('^' + TRIP_KEY_PREFIX.replace(/\./g, '\\.')) }).select('key').lean(),
  ]);
  const ids = new Set(upcoming.map((t) => String(t._id)));
  linked.forEach((d) => ids.add(d.key.slice(TRIP_KEY_PREFIX.length)));

  let synced = 0;
  const failed = [];
  for (const id of ids) {
    try {
      const r = await syncTripNow(id);
      if (r) synced++;
    } catch (err) {
      console.error(`[google-sheets] full sync: trip ${id} failed:`, err.message);
      failed.push(id);
      if (err.reconnect) {
        await patchSettings({ lastError: 'Google access was revoked. Please reconnect.' });
        throw err;
      }
    }
  }
  await patchSettings({ lastSync: new Date(), lastError: failed.length ? `${failed.length} trip(s) failed to sync. Try again.` : '' });
  return { synced, failed: failed.length };
}

module.exports = {
  isConfigured,
  authUrl,
  connect,
  disconnect,
  getStatus,
  getTripLink,
  syncTripNow,
  syncAll,
  queueTripSync,
};
