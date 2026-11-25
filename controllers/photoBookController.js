const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const PhotoBookTrip = require('../models/PhotoBookTrip');
const PhotoBookPage = require('../models/PhotoBookPage');
const AppError = require('../utils/AppError');
const { localizeTrip } = require('../utils/i18n');
const { cloudinary } = require('../config/cloudinary');

const MAX_PAGES = 40;
const LIVE_BOOKING = { $nin: ['draft', 'cancelled'] };

// Trips whose photo book this user may open: they hold a live booking on the
// trip, and the admin has switched the trip's photo book on.
async function booksForUser(userId) {
  const bookedTripIds = await Booking.distinct('tripId', { userId, status: LIVE_BOOKING, tripId: { $ne: null } });
  if (!bookedTripIds.length) return [];
  return PhotoBookTrip.find({ tripId: { $in: bookedTripIds }, enabled: true }).lean();
}

async function bookForUser(userId, tripId) {
  if (!mongoose.isValidObjectId(tripId)) return null;
  const [setting, booked] = await Promise.all([
    PhotoBookTrip.findOne({ tripId, enabled: true }).lean(),
    Booking.exists({ userId, tripId, status: LIVE_BOOKING }),
  ]);
  return setting && booked ? setting : null;
}

const pageJson = (p) => ({ _id: p._id, destination: p.destination, caption: p.caption, photo: p.photo });

// GET /photo-book: every photo book this traveller has.
const getPhotoBooksPage = async (req, res, next) => {
  try {
    const settings = await booksForUser(req.user._id);
    const tripIds = settings.map((s) => s.tripId);
    const [trips, counts] = await Promise.all([
      Trip.find({ _id: { $in: tripIds } }),
      PhotoBookPage.aggregate([
        { $match: { userId: req.user._id, tripId: { $in: tripIds } } },
        { $group: { _id: '$tripId', n: { $sum: 1 } } },
      ]),
    ]);
    const countBy = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    const openBy = Object.fromEntries(settings.map((s) => [String(s.tripId), s.submissionsOpen]));
    const books = trips
      .map((t) => ({ trip: localizeTrip(t, req.lang), open: Boolean(openBy[String(t._id)]), pages: countBy[String(t._id)] || 0 }))
      .sort((a, b) => Number(b.open) - Number(a.open));
    res.render('photoBook', { user: req.user, mode: 'list', books });
  } catch (err) {
    next(err);
  }
};

// GET /photo-book/:tripId: the book itself.
const getPhotoBookPage = async (req, res, next) => {
  try {
    const setting = await bookForUser(req.user._id, req.params.tripId);
    if (!setting) return next(new AppError('This photo book is not available.', 404));
    const [trip, pages] = await Promise.all([
      Trip.findById(req.params.tripId),
      PhotoBookPage.find({ userId: req.user._id, tripId: req.params.tripId }).sort('createdAt').lean(),
    ]);
    if (!trip) return next(new AppError('This photo book is not available.', 404));
    res.render('photoBook', {
      user: req.user,
      mode: 'book',
      trip: localizeTrip(trip, req.lang),
      book: { tripId: String(trip._id), open: setting.submissionsOpen, maxPages: MAX_PAGES, pages: pages.map(pageJson) },
    });
  } catch (err) {
    next(err);
  }
};

// Runs before the upload, so nothing reaches Cloudinary unless the page can be saved.
const checkCanAddPage = async (req, res, next) => {
  try {
    const setting = await bookForUser(req.user._id, req.params.tripId);
    if (!setting) return next(new AppError('This photo book is not available.', 404));
    if (!setting.submissionsOpen) return next(new AppError('This photo book is closed for new memories.', 403));
    const count = await PhotoBookPage.countDocuments({ userId: req.user._id, tripId: req.params.tripId });
    if (count >= MAX_PAGES) return next(new AppError(`Your photo book is full (${MAX_PAGES} pages).`, 400));
    next();
  } catch (err) {
    next(err);
  }
};

const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

// POST /api/photo-book/:tripId/pages
const addPage = async (req, res, next) => {
  try {
    if (!req.file) return next(new AppError('Please choose a photo for this page.', 400));
    const page = await PhotoBookPage.create({
      userId: req.user._id,
      tripId: req.params.tripId,
      destination: clean(req.body.destination, 60),
      caption: clean(req.body.caption, 200),
      photo: req.file.path,
      photoPublicId: req.file.filename || '',
    });
    res.status(201).json({ status: 'success', data: { page: pageJson(page) } });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/photo-book/:tripId/pages/:pageId (only while submissions are open)
const deletePage = async (req, res, next) => {
  try {
    const setting = await bookForUser(req.user._id, req.params.tripId);
    if (!setting) return next(new AppError('This photo book is not available.', 404));
    if (!setting.submissionsOpen) return next(new AppError('This photo book is closed, so pages can no longer be removed.', 403));
    if (!mongoose.isValidObjectId(req.params.pageId)) return next(new AppError('Page not found.', 404));
    const page = await PhotoBookPage.findOneAndDelete({ _id: req.params.pageId, userId: req.user._id, tripId: req.params.tripId });
    if (!page) return next(new AppError('Page not found.', 404));
    if (page.photoPublicId) {
      cloudinary.uploader.destroy(page.photoPublicId).catch((err) => console.error('[photo-book] photo cleanup failed:', err.message));
    }
    res.status(200).json({ status: 'success' });
  } catch (err) {
    next(err);
  }
};

// ── Admin ──

// GET /admin/photo-books
const getAdminPhotoBooksPage = async (req, res, next) => {
  try {
    // Every trip, including ones hidden from the site, so past trips can still get a photo book.
    const trips = await Trip.find({}).select('title date kind image status createdAt').sort('-createdAt').lean();
    const ids = trips.map((t) => t._id);
    const [settings, travellers, pages] = await Promise.all([
      PhotoBookTrip.find({ tripId: { $in: ids } }).lean(),
      Booking.aggregate([
        { $match: { tripId: { $in: ids }, status: LIVE_BOOKING } },
        // seats matches Booking Management (one booking can cover several people);
        // accounts is who can actually open the book, since it belongs to the person who booked.
        { $group: { _id: '$tripId', seats: { $sum: '$travelers' }, users: { $addToSet: '$userId' } } },
        { $project: { seats: 1, n: { $size: '$users' } } },
      ]),
      PhotoBookPage.aggregate([
        { $match: { tripId: { $in: ids } } },
        { $group: { _id: '$tripId', pages: { $sum: 1 }, users: { $addToSet: '$userId' } } },
        { $project: { pages: 1, users: { $size: '$users' } } },
      ]),
    ]);
    const by = (arr) => Object.fromEntries(arr.map((x) => [String(x._id || x.tripId), x]));
    const s = Object.fromEntries(settings.map((x) => [String(x.tripId), x]));
    const tr = by(travellers);
    const pg = by(pages);
    const rows = trips.map((t) => {
      const id = String(t._id);
      return {
        _id: id,
        title: t.title,
        date: t.date,
        kind: t.kind,
        image: t.image,
        hidden: t.status === 'inactive',
        enabled: Boolean(s[id] && s[id].enabled),
        submissionsOpen: Boolean(s[id] && s[id].submissionsOpen),
        travellers: tr[id] ? tr[id].seats : 0,
        accounts: tr[id] ? tr[id].n : 0,
        pages: pg[id] ? pg[id].pages : 0,
        contributors: pg[id] ? pg[id].users : 0,
      };
    });
    // Upcoming trips first, then past ones; newest first within each.
    rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'upcoming' ? -1 : 1));
    res.render('adminPhotoBooks', { user: req.user, rows });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/photo-books/:tripId  { enabled?, submissionsOpen? }
const updateTripSetting = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.tripId)) return next(new AppError('Trip not found.', 404));
    const trip = await Trip.exists({ _id: req.params.tripId });
    if (!trip) return next(new AppError('Trip not found.', 404));
    const $set = {};
    if (typeof req.body.enabled === 'boolean') $set.enabled = req.body.enabled;
    if (typeof req.body.submissionsOpen === 'boolean') $set.submissionsOpen = req.body.submissionsOpen;
    if (!Object.keys($set).length) return next(new AppError('Nothing to update.', 400));
    const setting = await PhotoBookTrip.findOneAndUpdate(
      { tripId: req.params.tripId },
      { $set },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.status(200).json({ status: 'success', data: { enabled: setting.enabled, submissionsOpen: setting.submissionsOpen } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPhotoBooksPage,
  getPhotoBookPage,
  checkCanAddPage,
  addPage,
  deletePage,
  getAdminPhotoBooksPage,
  updateTripSetting,
};
