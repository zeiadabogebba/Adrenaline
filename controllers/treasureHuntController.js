const crypto = require('crypto');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const User = require('../models/User');
const HuntPreset = require('../models/HuntPreset');
const HuntTrip = require('../models/HuntTrip');
const HuntTeam = require('../models/HuntTeam');
const AppError = require('../utils/AppError');
const { localizeTrip } = require('../utils/i18n');
const templates = require('../utils/huntTemplates');

const LIVE_BOOKING = { $nin: ['draft', 'cancelled'] };
const SITE_URL = (process.env.SITE_URL || 'https://adrenaline98.com').replace(/\/+$/, '');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const newCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
const isId = (v) => mongoose.isValidObjectId(v);

// ── Route helpers ──
// A route has its own legs, then the shared finish as its last leg.
const totalLegs = (route) => route.legs.length + 1;

function legAt(preset, route, i) {
  if (i < route.legs.length) {
    const l = route.legs[i];
    return { index: i, isFinish: false, place: l.place, riddle: l.riddle, guide: l.guide, extraHint: l.extraHint, photo: l.photo, code: l.code };
  }
  const f = preset.finish;
  return { index: i, isFinish: true, place: f.place, riddle: route.finishRiddle, guide: route.finishGuide, extraHint: route.finishExtraHint, photo: '', code: f.code };
}

const findRoute = (preset, routeId) => preset.routes.find((r) => String(r._id) === String(routeId));
const routeJson = (r) => ({ _id: String(r._id), name: r.name, color: r.color, label: r.label, stops: totalLegs(r) });

// What a team picks when it starts: the trip's buses, each linked to a route (set by the admin,
// otherwise bus 1 -> route 1, bus 2 -> route 2, ...). A trip without buses offers the routes.
function startOptions(buses, setting, preset) {
  const routes = preset.routes;
  if (!routes.length) return [];
  if (!buses || !buses.length) return routes.map((r) => ({ _id: String(r._id), name: r.name, routeId: String(r._id), kind: 'route', color: r.color }));
  const linked = Object.fromEntries(((setting && setting.busRoutes) || []).map((x) => [String(x.busId), String(x.routeId)]));
  return buses.map((b, i) => {
    const route = routes.find((r) => String(r._id) === linked[String(b._id)]) || routes[i % routes.length];
    return { _id: String(b._id), name: b.name, routeId: String(route._id), kind: 'bus', color: route.color };
  });
}

const tripBuses = async (tripId) => {
  const t = await Trip.findById(tripId).select('+buses').lean();
  return (t && t.buses) || [];
};

// ── Access ──
async function huntForUser(userId, tripId) {
  if (!isId(tripId)) return null;
  const [setting, booked] = await Promise.all([
    HuntTrip.findOne({ tripId, enabled: true, presetId: { $ne: null } }).lean(),
    Booking.exists({ userId, tripId, status: LIVE_BOOKING }),
  ]);
  if (!setting || !booked) return null;
  const preset = await HuntPreset.findById(setting.presetId).lean();
  return preset ? { setting, preset } : null;
}

async function huntsForUser(userId) {
  const tripIds = await Booking.distinct('tripId', { userId, status: LIVE_BOOKING, tripId: { $ne: null } });
  if (!tripIds.length) return [];
  return HuntTrip.find({ tripId: { $in: tripIds }, enabled: true, presetId: { $ne: null } }).lean();
}

// ── What a team member may see: cleared stops and the clue for the next one, never later ones ──
function teamState(team, preset, me) {
  const route = findRoute(preset, team.routeId);
  if (!route) return null;
  const total = totalLegs(route);
  const finished = team.elapsedMs != null;
  const used = team.hintsUsed || [];
  const cleared = [];
  for (let i = 0; i < Math.min(team.progress, total); i++) {
    const l = legAt(preset, route, i);
    cleared.push({ n: i + 1, place: l.place, split: team.splits[i] ?? null, hintUsed: used.includes(i), isFinish: l.isFinish });
  }
  let clue = null;
  if (!finished && team.progress < total) {
    const l = legAt(preset, route, team.progress);
    clue = {
      n: team.progress + 1,
      isFinish: l.isFinish,
      riddle: l.riddle,
      guide: l.guide,
      photo: l.photo || null,
      hasExtra: Boolean(l.extraHint),
      extra: used.includes(team.progress) ? l.extraHint : null,
    };
  }
  return {
    teamId: String(team._id),
    code: team.code,
    route: routeJson(route),
    bus: team.busName || '',
    members: (team.members || []).map((m) => ({ name: m.name || 'Traveller', me: String(m._id || m) === String(me) })),
    progress: team.progress,
    total,
    startedAt: new Date(team.startedAt).getTime(),
    serverNow: Date.now(),
    finished,
    elapsedMs: team.elapsedMs,
    splits: team.splits || [],
    lifelines: preset.lifelines,
    lifelinesLeft: Math.max(0, preset.lifelines - used.length),
    cleared,
    clue,
    finishMessage: finished ? preset.finish.message : null,
  };
}

async function loadTeamFor(userId, tripId) {
  return HuntTeam.findOne({ tripId, members: userId }).populate('members', 'name').lean();
}

async function leaderboard(tripId, preset) {
  const teams = await HuntTeam.find({ tripId }).populate('members', 'name').sort({ elapsedMs: 1, finishedAt: 1, progress: -1, startedAt: 1 }).lean();
  const routes = Object.fromEntries(preset.routes.map((r) => [String(r._id), r]));
  const row = (t) => {
    const r = routes[String(t.routeId)];
    return {
      teamId: String(t._id),
      code: t.code,
      route: r ? { name: r.name, color: r.color, label: r.label } : { name: '', color: '#888888', label: '' },
      members: (t.members || []).map((m) => m.name).filter(Boolean),
      progress: t.progress,
      total: r ? totalLegs(r) : t.progress,
      elapsedMs: t.elapsedMs,
      startedAt: new Date(t.startedAt).getTime(),
    };
  };
  const finished = teams.filter((t) => t.elapsedMs != null).sort((a, b) => a.elapsedMs - b.elapsedMs).map(row);
  const onTrail = teams.filter((t) => t.elapsedMs == null).sort((a, b) => b.progress - a.progress || a.startedAt - b.startedAt).map(row);
  return { finished, onTrail, serverNow: Date.now() };
}

const json = (res, status, body) => res.status(status).json(body);

// ════════════════════════ Traveller pages ════════════════════════

// GET /treasure-hunt (also the landing for a scanned QR: /treasure-hunt?scan=CODE)
const getHuntsPage = async (req, res, next) => {
  try {
    const settings = await huntsForUser(req.user._id);
    const scan = cleanCode(req.query.scan);
    if (scan && settings.length) {
      const presets = await HuntPreset.find({ _id: { $in: settings.map((s) => s.presetId) } }).lean();
      const has = (p) => p.finish.code === scan || p.routes.some((r) => r.legs.some((l) => l.code === scan));
      const matches = settings.filter((s) => { const p = presets.find((x) => String(x._id) === String(s.presetId)); return p && has(p); });
      if (matches.length) {
        // Prefer the hunt this traveller is already playing.
        const mine = await HuntTeam.findOne({ tripId: { $in: matches.map((m) => m.tripId) }, members: req.user._id }).select('tripId').lean();
        const tripId = mine ? mine.tripId : matches[0].tripId;
        return res.redirect(`/treasure-hunt/${tripId}?scan=${encodeURIComponent(scan)}`);
      }
    }
    const [trips, teams] = await Promise.all([
      Trip.find({ _id: { $in: settings.map((s) => s.tripId) } }),
      HuntTeam.find({ tripId: { $in: settings.map((s) => s.tripId) }, members: req.user._id }).lean(),
    ]);
    const openBy = Object.fromEntries(settings.map((s) => [String(s.tripId), s.open]));
    const teamBy = Object.fromEntries(teams.map((t) => [String(t.tripId), t]));
    const hunts = trips.map((t) => {
      const team = teamBy[String(t._id)];
      return { trip: localizeTrip(t, req.lang), open: Boolean(openBy[String(t._id)]), team: team ? { code: team.code, finished: team.elapsedMs != null, elapsedMs: team.elapsedMs, progress: team.progress } : null };
    }).sort((a, b) => Number(b.open) - Number(a.open));
    res.render('treasureHunt', { user: req.user, mode: 'list', hunts, scanMiss: Boolean(scan) });
  } catch (err) {
    next(err);
  }
};

// GET /treasure-hunt/:tripId
const getHuntPage = async (req, res, next) => {
  try {
    const hunt = await huntForUser(req.user._id, req.params.tripId);
    if (!hunt) return next(new AppError('This treasure hunt is not available.', 404));
    const { setting, preset } = hunt;
    const [trip, team, board] = await Promise.all([
      Trip.findById(req.params.tripId),
      loadTeamFor(req.user._id, req.params.tripId),
      leaderboard(req.params.tripId, preset),
    ]);
    if (!trip) return next(new AppError('This treasure hunt is not available.', 404));
    res.render('treasureHunt', {
      user: req.user,
      mode: 'hunt',
      trip: localizeTrip(trip, req.lang),
      hunt: {
        tripId: String(trip._id),
        open: setting.open,
        name: preset.name,
        routes: preset.routes.map(routeJson),
        options: startOptions(await tripBuses(trip._id), setting, preset).map(({ _id, name, kind }) => ({ _id, name, kind })),
        lifelines: preset.lifelines,
        state: team ? teamState(team, preset, req.user._id) : null,
        board,
        pendingScan: cleanCode(req.query.scan),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ════════════════════════ Traveller API ════════════════════════

// GET /api/treasure-hunt/:tripId/state
const getState = async (req, res, next) => {
  try {
    const hunt = await huntForUser(req.user._id, req.params.tripId);
    if (!hunt) return next(new AppError('This treasure hunt is not available.', 404));
    const [team, board] = await Promise.all([loadTeamFor(req.user._id, req.params.tripId), leaderboard(req.params.tripId, hunt.preset)]);
    json(res, 200, { status: 'success', open: hunt.setting.open, state: team ? teamState(team, hunt.preset, req.user._id) : null, board });
  } catch (err) {
    next(err);
  }
};

// Team IDs: 8 characters with no look-alike letters, shown as ABCD-EFGH.
const newTeamCode = () => Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

// POST /api/treasure-hunt/:tripId/start { busId }: a new team on the route of the bus it chose.
// The server gives the team its ID.
const startTeam = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const hunt = await huntForUser(req.user._id, tripId);
    if (!hunt) return next(new AppError('This treasure hunt is not available.', 404));
    const { setting, preset } = hunt;

    const existing = await loadTeamFor(req.user._id, tripId);
    if (existing) return json(res, 200, { status: 'success', joined: false, state: teamState(existing, preset, req.user._id) });
    if (!setting.open) return json(res, 403, { status: 'fail', event: 'closed_start', message: 'The treasure hunt is closed right now.' });
    if (!preset.routes.length) return next(new AppError('This treasure hunt has no routes yet.', 400));

    // The team gets the route linked to the bus it picked.
    const option = startOptions(await tripBuses(tripId), setting, preset).find((o) => o._id === String(req.body.busId || ''));
    const route = option && findRoute(preset, option.routeId);
    if (!route) return json(res, 400, { status: 'fail', event: 'pick_bus', message: 'Choose the bus you came on.' });

    let team = null;
    for (let attempt = 0; attempt < 5 && !team; attempt++) {
      try {
        team = await HuntTeam.create({ tripId, presetId: preset._id, routeId: route._id, code: newTeamCode(), busId: option.kind === 'bus' ? option._id : null, busName: option.kind === 'bus' ? option.name : '', members: [req.user._id], startedAt: new Date() });
      } catch (err) {
        if (err.code !== 11000) throw err; // an ID clash: try another
      }
    }
    if (!team) return next(new AppError('Could not start a team. Please try again.', 500));
    const fresh = await loadTeamFor(req.user._id, tripId);
    json(res, 201, { status: 'success', joined: true, state: teamState(fresh, preset, req.user._id) });
  } catch (err) {
    next(err);
  }
};

// POST /api/treasure-hunt/:tripId/join { code }: join a team that already started.
const joinTeam = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const hunt = await huntForUser(req.user._id, tripId);
    if (!hunt) return next(new AppError('This treasure hunt is not available.', 404));
    const { preset } = hunt;

    const existing = await loadTeamFor(req.user._id, tripId);
    if (existing) return json(res, 200, { status: 'success', joined: false, state: teamState(existing, preset, req.user._id) });

    const code = cleanCode(req.body.code);
    const team = code && (await HuntTeam.findOneAndUpdate({ tripId, code }, { $addToSet: { members: req.user._id } }));
    if (!team) return json(res, 404, { status: 'fail', event: 'team_not_found', message: "There's no team with that ID on this trip. Check it with your teammates." });
    const fresh = await loadTeamFor(req.user._id, tripId);
    json(res, 200, { status: 'success', joined: true, state: teamState(fresh, preset, req.user._id) });
  } catch (err) {
    next(err);
  }
};

// POST /api/treasure-hunt/:tripId/leave: only before the team's first scan, for someone who
// started a new team by mistake. An empty team is removed.
const leaveTeam = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const hunt = await huntForUser(req.user._id, tripId);
    if (!hunt) return next(new AppError('This treasure hunt is not available.', 404));
    const team = await HuntTeam.findOne({ tripId, members: req.user._id });
    if (!team) return json(res, 200, { status: 'success', state: null });
    if (team.progress > 0) return json(res, 409, { status: 'fail', event: 'cant_leave', message: 'Your team has already cleared a stop, so you can no longer leave it.' });
    await HuntTeam.updateOne({ _id: team._id, progress: 0 }, { $pull: { members: req.user._id } });
    await HuntTeam.deleteOne({ _id: team._id, progress: 0, members: { $size: 0 } });
    json(res, 200, { status: 'success', state: null });
  } catch (err) {
    next(err);
  }
};

// POST /api/treasure-hunt/:tripId/scan { code }
const scan = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const hunt = await huntForUser(req.user._id, tripId);
    if (!hunt) return next(new AppError('This treasure hunt is not available.', 404));
    const { setting, preset } = hunt;
    let team = await loadTeamFor(req.user._id, tripId);
    if (!team) return json(res, 409, { status: 'fail', event: 'need_team', message: 'Join your team first to claim this stop.' });
    if (team.elapsedMs != null) return json(res, 200, { status: 'success', event: 'already_finished', state: teamState(team, preset, req.user._id) });
    if (!setting.open) return json(res, 403, { status: 'fail', event: 'closed', message: 'The treasure hunt is closed, so stops can no longer be claimed.' });

    const code = cleanCode(req.body.code);
    const route = findRoute(preset, team.routeId);
    const total = totalLegs(route);
    let index = -1;
    for (let i = 0; i < total && code; i++) if (legAt(preset, route, i).code === code) { index = i; break; }

    if (index === -1) {
      const other = code && preset.routes.find((r) => r.legs.some((l) => l.code === code));
      const message = other
        ? `That QR is on ${other.name}. Your team is on ${route.name}.`
        : "That code doesn't match any stop. Check the letters under the QR.";
      return json(res, 400, { status: 'fail', event: other ? 'other_route' : 'invalid', routeName: other ? other.name : null, message });
    }
    if (index < team.progress) return json(res, 200, { status: 'success', event: 'already', number: index + 1, state: teamState(team, preset, req.user._id) });
    if (index > team.progress) {
      return json(res, 400, { status: 'fail', event: 'wrong_order', scanned: index + 1, expected: team.progress + 1, message: `That's stop ${index + 1}. Stops unlock in order, so find stop ${team.progress + 1} first.` });
    }

    const now = Date.now();
    const elapsed = now - new Date(team.startedAt).getTime();
    const isFinish = index === total - 1;
    // Guard on the old progress so two teammates scanning together can't double-count.
    const update = { $set: { progress: index + 1 }, $push: { splits: elapsed } };
    if (isFinish) Object.assign(update.$set, { finishedAt: new Date(now), elapsedMs: elapsed });
    const done = await HuntTeam.findOneAndUpdate({ _id: team._id, progress: index }, update);
    team = await loadTeamFor(req.user._id, tripId);
    if (!done) return json(res, 200, { status: 'success', event: 'already', number: index + 1, state: teamState(team, preset, req.user._id) });
    json(res, 200, { status: 'success', event: isFinish ? 'finished' : 'captured', number: index + 1, split: elapsed, state: teamState(team, preset, req.user._id) });
  } catch (err) {
    next(err);
  }
};

// POST /api/treasure-hunt/:tripId/hint: spend a lifeline on the current stop's extra hint.
const useHint = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const hunt = await huntForUser(req.user._id, tripId);
    if (!hunt) return next(new AppError('This treasure hunt is not available.', 404));
    const { setting, preset } = hunt;
    const team = await loadTeamFor(req.user._id, tripId);
    if (!team) return next(new AppError('Join your team first.', 409));
    if (team.elapsedMs != null) return next(new AppError('Your team already found the treasure!', 400));
    if (!setting.open) return next(new AppError('The treasure hunt is closed right now.', 403));
    const route = findRoute(preset, team.routeId);
    const leg = legAt(preset, route, team.progress);
    if (!leg.extraHint) return next(new AppError('There is no extra hint for this stop.', 400));
    if ((team.hintsUsed || []).includes(team.progress)) {
      return json(res, 200, { status: 'success', state: teamState(team, preset, req.user._id) });
    }
    const ok = await HuntTeam.findOneAndUpdate(
      { _id: team._id, progress: team.progress, hintsUsed: { $ne: team.progress }, $expr: { $lt: [{ $size: '$hintsUsed' }, preset.lifelines] } },
      { $push: { hintsUsed: team.progress } }
    );
    const fresh = await loadTeamFor(req.user._id, tripId);
    if (!ok) return json(res, 400, { status: 'fail', event: 'no_lifelines', message: 'Your team has no lifelines left.', state: teamState(fresh, preset, req.user._id) });
    json(res, 200, { status: 'success', state: teamState(fresh, preset, req.user._id) });
  } catch (err) {
    next(err);
  }
};

// ════════════════════════ Admin pages ════════════════════════

async function presetUsage() {
  const [assigned, teams] = await Promise.all([
    HuntTrip.aggregate([{ $match: { presetId: { $ne: null } } }, { $group: { _id: '$presetId', n: { $sum: 1 } } }]),
    HuntTeam.aggregate([{ $group: { _id: '$presetId', n: { $sum: 1 } } }]),
  ]);
  return {
    trips: Object.fromEntries(assigned.map((a) => [String(a._id), a.n])),
    teams: Object.fromEntries(teams.map((a) => [String(a._id), a.n])),
  };
}

// GET /admin/treasure-hunt
const getAdminPage = async (req, res, next) => {
  try {
    const [presets, trips, settings, teamCounts, usage] = await Promise.all([
      HuntPreset.find().sort('-updatedAt').lean(),
      Trip.find({}).select('title date kind image status createdAt +buses').sort('-createdAt').lean(),
      HuntTrip.find().lean(),
      HuntTeam.aggregate([{ $group: { _id: '$tripId', teams: { $sum: 1 }, finished: { $sum: { $cond: [{ $ne: ['$elapsedMs', null] }, 1, 0] } } } }]),
      presetUsage(),
    ]);
    const s = Object.fromEntries(settings.map((x) => [String(x.tripId), x]));
    const tc = Object.fromEntries(teamCounts.map((x) => [String(x._id), x]));
    const rows = trips.map((t) => {
      const id = String(t._id);
      const set = s[id] || {};
      return {
        _id: id, title: t.title, date: t.date, kind: t.kind, image: t.image, hidden: t.status === 'inactive',
        presetId: set.presetId ? String(set.presetId) : '',
        buses: (t.buses || []).map((b) => ({ _id: String(b._id), name: b.name })),
        busRoutes: Object.fromEntries((set.busRoutes || []).map((x) => [String(x.busId), String(x.routeId)])),
        enabled: Boolean(set.enabled), open: Boolean(set.open),
        teams: tc[id] ? tc[id].teams : 0, finished: tc[id] ? tc[id].finished : 0,
      };
    });
    rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'upcoming' ? -1 : 1));
    const presetRows = presets.map((p) => ({
      _id: String(p._id), name: p.name, lifelines: p.lifelines,
      routes: p.routes.map((r) => ({ name: r.name, color: r.color, stops: totalLegs(r) })),
      qrCount: p.routes.reduce((n, r) => n + r.legs.length, 0) + 1,
      trips: usage.trips[String(p._id)] || 0, teams: usage.teams[String(p._id)] || 0, updatedAt: p.updatedAt,
    }));
    const presetRoutes = Object.fromEntries(presets.map((p) => [String(p._id), p.routes.map((r) => ({ _id: String(r._id), name: r.name, color: r.color }))]));
    res.render('adminTreasureHunt', { user: req.user, presets: presetRows, rows, presetRoutes });
  } catch (err) {
    next(err);
  }
};

// GET /admin/treasure-hunt/presets/new and /admin/treasure-hunt/presets/:id
const getPresetEditor = async (req, res, next) => {
  try {
    let preset = null;
    let locked = false;
    if (req.params.id) {
      if (!isId(req.params.id)) return next(new AppError('Preset not found.', 404));
      preset = await HuntPreset.findById(req.params.id).lean();
      if (!preset) return next(new AppError('Preset not found.', 404));
      locked = Boolean(await HuntTeam.exists({ presetId: preset._id }));
    }
    res.render('adminHuntPreset', { user: req.user, preset, locked, siteUrl: SITE_URL });
  } catch (err) {
    next(err);
  }
};

// GET /admin/treasure-hunt/presets/:id/print
const getPresetPrint = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return next(new AppError('Preset not found.', 404));
    const preset = await HuntPreset.findById(req.params.id).lean();
    if (!preset) return next(new AppError('Preset not found.', 404));
    res.render('adminHuntPrint', { preset, scanBase: `${SITE_URL}/treasure-hunt?scan=` });
  } catch (err) {
    next(err);
  }
};

// GET /admin/treasure-hunt/trips/:tripId: every team and its time.
const getTripResults = async (req, res, next) => {
  try {
    if (!isId(req.params.tripId)) return next(new AppError('Trip not found.', 404));
    const [trip, setting] = await Promise.all([
      Trip.findById(req.params.tripId).select('title date kind').lean(),
      HuntTrip.findOne({ tripId: req.params.tripId }).lean(),
    ]);
    if (!trip) return next(new AppError('Trip not found.', 404));
    const preset = setting && setting.presetId ? await HuntPreset.findById(setting.presetId).lean() : null;
    const teams = await HuntTeam.find({ tripId: trip._id }).populate('members', 'name email').lean();
    const routes = preset ? Object.fromEntries(preset.routes.map((r) => [String(r._id), r])) : {};
    const rows = teams.map((t) => {
      const r = routes[String(t.routeId)];
      return {
        _id: String(t._id), code: t.code, members: t.members || [],
        route: r ? { name: r.name, color: r.color } : { name: 'Removed route', color: '#888888' },
        progress: t.progress, total: r ? totalLegs(r) : t.progress, elapsedMs: t.elapsedMs,
        startedAt: t.startedAt, finishedAt: t.finishedAt, hintsUsed: (t.hintsUsed || []).length, splits: t.splits || [],
      };
    }).sort((a, b) => (a.elapsedMs == null) - (b.elapsedMs == null) || (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0) || b.progress - a.progress);
    res.render('adminHuntResults', { user: req.user, trip, setting: setting || {}, preset, rows });
  } catch (err) {
    next(err);
  }
};

// ════════════════════════ Admin API ════════════════════════

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// Builds a clean preset from the editor's JSON. Blank codes get a fresh one; ids are kept so
// teams already playing keep pointing at the same route.
function presetFromBody(body) {
  const used = new Set();
  const code = (v) => {
    let c = cleanCode(v);
    if (c.length < 4 || used.has(c)) c = '';
    while (!c || used.has(c)) c = newCode();
    used.add(c);
    return c;
  };
  const b = body || {};
  const f = b.finish || {};
  const out = {
    name: str(b.name, 100),
    description: str(b.description, 1000),
    lifelines: Math.max(0, Math.min(10, parseInt(b.lifelines, 10) || 0)),
    finish: {
      place: str(f.place, 120),
      placement: str(f.placement, 200), message: str(f.message, 600), code: code(f.code),
    },
    routes: (Array.isArray(b.routes) ? b.routes : []).slice(0, 12).map((r) => ({
      ...(isId(r._id) ? { _id: r._id } : {}),
      name: str(r.name, 80) || 'Route',
      color: /^#[0-9a-fA-F]{6}$/.test(r.color || '') ? r.color : '#DC2626',
      label: str(r.label, 8),
      finishRiddle: str(r.finishRiddle, 600),
      finishGuide: str(r.finishGuide, 600),
      finishExtraHint: str(r.finishExtraHint, 400),
      legs: (Array.isArray(r.legs) ? r.legs : []).slice(0, 30).map((l) => ({
        ...(isId(l._id) ? { _id: l._id } : {}),
        place: str(l.place, 120),
        placement: str(l.placement, 200), riddle: str(l.riddle, 600), guide: str(l.guide, 600),
        extraHint: str(l.extraHint, 400), photo: str(l.photo, 500), photoPublicId: str(l.photoPublicId, 300),
        code: code(l.code),
      })),
    })),
  };
  return out;
}

function presetProblems(p) {
  if (!p.name) return 'Give the preset a name.';
  if (!p.routes.length) return 'Add at least one route.';
  for (const r of p.routes) {
    if (!r.legs.length) return `${r.name} needs at least one stop before the finish.`;
    for (const [i, l] of r.legs.entries()) if (!l.riddle) return `${r.name}, stop ${i + 1} needs a riddle.`;
    if (!r.finishRiddle) return `${r.name} needs the riddle that leads to the finish.`;
  }
  return null;
}

// Same routes and stops, in the same order, as the saved preset.
const sameShape = (a, b) => a.routes.length === b.routes.length && a.routes.every((r, i) => {
  const o = b.routes[i];
  return String(r._id) === String(o._id) && r.legs.length === o.legs.length && r.legs.every((l, j) => String(l._id) === String(o.legs[j]._id));
});

// POST /api/admin/treasure-hunt/presets
const createPreset = async (req, res, next) => {
  try {
    const data = presetFromBody(req.body);
    const problem = presetProblems(data);
    if (problem) return next(new AppError(problem, 400));
    const preset = await HuntPreset.create(data);
    json(res, 201, { status: 'success', data: { id: String(preset._id) } });
  } catch (err) {
    next(err);
  }
};

// Adds the ready-made presets once, the first time the app starts with this feature.
// A marker in AppSetting records it, so a preset the admin renames or deletes is never re-added.
async function seedPresets() {
  const AppSetting = require('../models/AppSetting');
  for (const [name, tpl] of Object.entries(templates)) {
    const key = `seed:hunt-preset:${name}`;
    try {
      await AppSetting.create({ key, value: { at: new Date() } });
    } catch (err) {
      if (err.code === 11000) continue; // already added before
      throw err;
    }
    try {
      const preset = await HuntPreset.create(presetFromBody(tpl));
      await AppSetting.updateOne({ key }, { $set: { value: { at: new Date(), presetId: preset._id } } });
      console.log(`[treasure-hunt] added preset "${preset.name}"`);
    } catch (err) {
      await AppSetting.deleteOne({ key }); // try again on the next start
      throw err;
    }
  }
}

// PUT /api/admin/treasure-hunt/presets/:id
const updatePreset = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return next(new AppError('Preset not found.', 404));
    const current = await HuntPreset.findById(req.params.id);
    if (!current) return next(new AppError('Preset not found.', 404));
    const data = presetFromBody(req.body);
    const problem = presetProblems(data);
    if (problem) return next(new AppError(problem, 400));
    if (await HuntTeam.exists({ presetId: current._id })) {
      const probe = new HuntPreset(data); // gives new routes/stops their ids so the shapes can be compared
      if (!sameShape(probe, current)) {
        return next(new AppError('Teams have already played this preset, so its routes and stops can no longer be added, removed or reordered. You can still edit the text. Duplicate it to change the routes.', 409));
      }
    }
    current.set(data);
    await current.save();
    json(res, 200, { status: 'success', data: { preset: current.toObject() } });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/treasure-hunt/presets/:id/duplicate (new codes, so the copies' QRs never clash)
const duplicatePreset = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return next(new AppError('Preset not found.', 404));
    const p = await HuntPreset.findById(req.params.id).lean();
    if (!p) return next(new AppError('Preset not found.', 404));
    const copy = presetFromBody({
      ...p,
      name: `${p.name} (copy)`.slice(0, 100),
      finish: { ...p.finish, code: '' },
      routes: p.routes.map((r) => ({ ...r, _id: undefined, legs: r.legs.map((l) => ({ ...l, _id: undefined, code: '' })) })),
    });
    const preset = await HuntPreset.create(copy);
    json(res, 201, { status: 'success', data: { id: String(preset._id) } });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/treasure-hunt/presets/:id (only when no trip uses it)
const deletePreset = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return next(new AppError('Preset not found.', 404));
    if (await HuntTrip.exists({ presetId: req.params.id })) return next(new AppError('A trip is using this preset. Choose another preset for that trip first.', 409));
    if (await HuntTeam.exists({ presetId: req.params.id })) return next(new AppError('Teams have played this preset, so it is kept for their results.', 409));
    await HuntPreset.deleteOne({ _id: req.params.id });
    json(res, 200, { status: 'success' });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/treasure-hunt/photo (a stop's photo; the editor stores the returned URL)
const uploadPhoto = (req, res, next) => {
  if (!req.file) return next(new AppError('Choose a photo.', 400));
  json(res, 201, { status: 'success', data: { url: req.file.path, publicId: req.file.filename || '' } });
};

// PATCH /api/admin/treasure-hunt/trips/:tripId { presetId?, enabled?, open? }
const updateTripSetting = async (req, res, next) => {
  try {
    const { tripId } = req.params;
    if (!isId(tripId) || !(await Trip.exists({ _id: tripId }))) return next(new AppError('Trip not found.', 404));
    const current = await HuntTrip.findOne({ tripId }).lean();
    const $set = {};
    if ('presetId' in req.body) {
      const pid = req.body.presetId || null;
      if (pid && (!isId(pid) || !(await HuntPreset.exists({ _id: pid })))) return next(new AppError('Preset not found.', 404));
      const changing = String(pid || '') !== String((current && current.presetId) || '');
      if (changing && (await HuntTeam.exists({ tripId }))) {
        return next(new AppError('Teams have already played on this trip. Reset its results before changing the preset.', 409));
      }
      $set.presetId = pid;
      if (changing) $set.busRoutes = [];
      if (!pid) Object.assign($set, { enabled: false, open: false });
    }
    if (typeof req.body.enabled === 'boolean') $set.enabled = req.body.enabled;
    if (typeof req.body.open === 'boolean') $set.open = req.body.open;
    if (Array.isArray(req.body.busRoutes)) {
      // Only this trip's buses, and only routes from the trip's preset.
      const pid = 'presetId' in $set ? $set.presetId : current && current.presetId;
      const [buses, preset] = await Promise.all([tripBuses(tripId), pid ? HuntPreset.findById(pid).select('routes._id').lean() : null]);
      const busIds = new Set(buses.map((b) => String(b._id)));
      const routeIds = new Set(((preset && preset.routes) || []).map((r) => String(r._id)));
      $set.busRoutes = req.body.busRoutes
        .filter((x) => x && busIds.has(String(x.busId)) && routeIds.has(String(x.routeId)))
        .map((x) => ({ busId: x.busId, routeId: x.routeId }));
    }
    if (!Object.keys($set).length) return next(new AppError('Nothing to update.', 400));
    const presetAfter = 'presetId' in $set ? $set.presetId : current && current.presetId;
    if (($set.enabled || $set.open) && !presetAfter) return next(new AppError('Choose a preset for this trip first.', 400));
    if ($set.enabled === false) $set.open = false;
    if ($set.open === true && !(current && current.enabled) && $set.enabled !== true) $set.enabled = true;
    const setting = await HuntTrip.findOneAndUpdate({ tripId }, { $set }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    json(res, 200, { status: 'success', data: { presetId: setting.presetId ? String(setting.presetId) : '', enabled: setting.enabled, open: setting.open, busRoutes: Object.fromEntries((setting.busRoutes || []).map((x) => [String(x.busId), String(x.routeId)])) } });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/treasure-hunt/trips/:tripId/teams[/:teamId]
const resetTeams = async (req, res, next) => {
  try {
    const { tripId, teamId } = req.params;
    if (!isId(tripId) || (teamId && !isId(teamId))) return next(new AppError('Not found.', 404));
    const filter = teamId ? { tripId, _id: teamId } : { tripId };
    const { deletedCount } = await HuntTeam.deleteMany(filter);
    json(res, 200, { status: 'success', data: { deleted: deletedCount } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getHuntsPage,
  getHuntPage,
  getState,
  startTeam,
  joinTeam,
  leaveTeam,
  scan,
  useHint,
  getAdminPage,
  getPresetEditor,
  getPresetPrint,
  getTripResults,
  createPreset,
  updatePreset,
  duplicatePreset,
  deletePreset,
  uploadPhoto,
  updateTripSetting,
  resetTeams,
  seedPresets,
  // exported for tests
  _internal: { presetFromBody, presetProblems, teamState, totalLegs, legAt, newCode },
};
