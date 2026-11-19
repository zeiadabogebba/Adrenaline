// Brevo (marketing email) integration: keeps the "trip emails" list in step
// with users' marketingOptIn setting.
//
// Everything here is best-effort: if BREVO_API_KEY is missing or Brevo is
// down, the site keeps working and the admin "Sync now" button catches up.
const User = require('../models/User');
const AppSetting = require('../models/AppSetting');

const API = 'https://api.brevo.com/v3';
const LIST_NAME = 'Website users - trip emails';
const SYNC_KEY = 'brevoSync';

const isEnabled = () => Boolean(process.env.BREVO_API_KEY);

async function brevo(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Brevo ${method} ${path.split('?')[0]} -> ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

// Eligible = opted in (missing field counts as yes) and email verified (missing counts as yes for legacy users).
const isEligible = (u) => Boolean(u && u.email) && u.marketingOptIn !== false && u.emailVerified !== false;

function attributesFor(user) {
  const parts = String(user.name || '').trim().split(/\s+/);
  return { FIRSTNAME: parts[0] || '', LASTNAME: parts.slice(1).join(' ') };
}

let cachedListId = null;
async function getListId() {
  if (cachedListId) return cachedListId;
  const { lists = [] } = await brevo('GET', '/contacts/lists?limit=50&offset=0');
  let list = lists.find((l) => l.name === LIST_NAME);
  if (!list) {
    const { folders = [] } = await brevo('GET', '/contacts/folders?limit=10&offset=0');
    const folderId = folders.length ? folders[0].id : (await brevo('POST', '/contacts/folders', { name: 'Website' })).id;
    list = await brevo('POST', '/contacts/lists', { name: LIST_NAME, folderId });
  }
  cachedListId = list.id;
  return cachedListId;
}

async function getContact(email) {
  try {
    return await brevo('GET', `/contacts/${encodeURIComponent(String(email).toLowerCase())}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// Add/update one user in the list. `explicitOptIn` = the user just ticked the
// box themselves, which is the only case where a previous Brevo unsubscribe is lifted.
async function upsertContact(user, { explicitOptIn = false } = {}) {
  const listId = await getListId();
  const body = {
    email: String(user.email).toLowerCase(),
    attributes: attributesFor(user),
    listIds: [listId],
    updateEnabled: true,
  };
  if (explicitOptIn) body.emailBlacklisted = false;
  await brevo('POST', '/contacts', body);
}

async function removeFromList(email) {
  const listId = await getListId();
  try {
    await brevo('POST', `/contacts/lists/${listId}/contacts/remove`, { emails: [String(email).toLowerCase()] });
  } catch (err) {
    // 400 = contact isn't in the list / doesn't exist: already the state we want.
    if (err.status !== 400 && err.status !== 404) throw err;
  }
}

// Fire-and-forget: push one user's current state to Brevo. Never throws.
function syncUserInBackground(user, opts = {}) {
  if (!isEnabled() || !user || !user.email) return;
  const job = isEligible(user) ? upsertContact(user, opts) : removeFromList(user.email);
  job.catch((err) => console.error('[brevo] user sync failed:', err.message));
}

function removeInBackground(email) {
  if (!isEnabled() || !email) return;
  removeFromList(email).catch((err) => console.error('[brevo] remove failed:', err.message));
}

// Webhook / sync helper: if Brevo says this contact is unsubscribed (or not in
// our list any more), turn their site setting off. Brevo is asked directly, so a
// forged webhook can't opt anyone out.
async function applyBrevoUnsubscribe(email) {
  const contact = await getContact(email);
  if (!contact) return false;
  const listId = await getListId();
  const unsubscribed = contact.emailBlacklisted === true || (contact.listUnsubscribed || []).includes(listId);
  if (!unsubscribed) return false;
  const r = await User.updateOne(
    { email: String(email).toLowerCase(), marketingOptIn: { $ne: false } },
    { $set: { marketingOptIn: false, marketingOptInUpdatedAt: new Date() } }
  );
  return r.modifiedCount > 0;
}

async function listAllContacts() {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const { contacts = [] } = await brevo('GET', `/contacts?limit=1000&offset=${offset}`);
    all.push(...contacts);
    if (contacts.length < 1000) break;
  }
  return all;
}

// Full two-way sync (admin "Sync now" button / scripts/syncBrevo.js).
async function fullSync({ dryRun = false } = {}) {
  if (!isEnabled()) throw new Error('BREVO_API_KEY is not set on the server.');
  const listId = await getListId();
  const contacts = await listAllContacts();
  const byEmail = new Map(contacts.map((c) => [String(c.email).toLowerCase(), c]));

  const users = await User.find({}, 'name email marketingOptIn emailVerified').lean();
  const lower = (u) => String(u.email || '').toLowerCase();

  // 1) Brevo unsubscribes -> site
  const toOptOut = users.filter((u) => {
    const c = byEmail.get(lower(u));
    return u.marketingOptIn !== false && c && (c.emailBlacklisted || (c.listUnsubscribed || []).includes(listId));
  });
  const optOutIds = new Set(toOptOut.map((u) => String(u._id)));

  // 2) site -> Brevo
  const eligible = users.filter((u) => isEligible(u) && !optOutIds.has(String(u._id)));
  const eligibleEmails = new Set(eligible.map(lower));
  const toRemove = contacts
    .filter((c) => (c.listIds || []).includes(listId) && !eligibleEmails.has(String(c.email).toLowerCase()))
    .map((c) => String(c.email).toLowerCase());

  const result = {
    at: new Date().toISOString(),
    dryRun,
    siteUsers: users.length,
    eligible: eligible.length,
    optedOutFromBrevo: toOptOut.length,
    removedFromList: toRemove.length,
    unverifiedSkipped: users.filter((u) => u.emailVerified === false && u.marketingOptIn !== false).length,
  };
  if (dryRun) return result;

  if (toOptOut.length) {
    await User.updateMany(
      { _id: { $in: toOptOut.map((u) => u._id) } },
      { $set: { marketingOptIn: false, marketingOptInUpdatedAt: new Date() } }
    );
  }
  for (let i = 0; i < toRemove.length; i += 150) {
    await brevo('POST', `/contacts/lists/${listId}/contacts/remove`, { emails: toRemove.slice(i, i + 150) });
  }
  if (eligible.length) {
    await brevo('POST', '/contacts/import', {
      listIds: [listId],
      updateExistingContacts: true,
      emptyContactsAttributes: false,
      jsonBody: eligible.map((u) => ({ email: lower(u), attributes: attributesFor(u) })),
    });
  }
  await AppSetting.updateOne({ key: SYNC_KEY }, { $set: { value: result } }, { upsert: true });
  return result;
}

async function getStatus() {
  const [optedIn, optedOut, unverified, last] = await Promise.all([
    User.countDocuments({ marketingOptIn: { $ne: false }, emailVerified: { $ne: false } }),
    User.countDocuments({ marketingOptIn: false }),
    User.countDocuments({ marketingOptIn: { $ne: false }, emailVerified: false }),
    AppSetting.findOne({ key: SYNC_KEY }).lean(),
  ]);
  const status = { enabled: isEnabled(), optedIn, optedOut, unverified, lastSync: last ? last.value : null, listCount: null, listError: null };
  if (status.enabled) {
    try {
      const list = await brevo('GET', `/contacts/lists/${await getListId()}`);
      status.listCount = list.uniqueSubscribers ?? list.totalSubscribers ?? null;
    } catch (err) {
      status.listError = 'Could not reach Brevo.';
      console.error('[brevo] status failed:', err.message);
    }
  }
  return status;
}

module.exports = {
  isEnabled, isEligible, getListId, syncUserInBackground, removeInBackground,
  applyBrevoUnsubscribe, fullSync, getStatus, brevo,
};
