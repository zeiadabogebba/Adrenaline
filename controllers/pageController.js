const fs = require('fs');
const path = require('path');
const Package = require('../models/Package');
const Booking = require('../models/Booking');
const Review  = require('../models/review');
const User    = require('../models/User');
const Contact = require('../models/contact');
const Trip    = require('../models/Trip');
const TripRequest = require('../models/TripRequest');
const AppError = require('../utils/AppError');
const { effectiveStatus } = require('../utils/bookingStatus');
const { localizePackage, localizeTrip, localizeDateText, place } = require('../utils/i18n');

const localizePackages = (docs, lang) => docs.map((d) => localizePackage(d, lang));
const localizeTrips = (docs, lang) => docs.map((d) => localizeTrip(d, lang));

// Bookings store an English snapshot of the trip name and date; on Arabic pages show the
// linked trip's Arabic copy instead when it has one.
function localizeBooking(booking, lang) {
  if (!booking) return booking;
  const obj = typeof booking.toObject === 'function' ? booking.toObject() : { ...booking };
  if (obj.tripId && typeof obj.tripId === 'object') {
    const original = obj.tripId;
    obj.tripId = localizeTrip(original, lang);
    if (obj.tripId.title !== original.title && obj.packageName === original.title) obj.packageName = obj.tripId.title;
    if (original.date && obj.date === original.date) obj.date = obj.tripId.date;
  }
  if (obj.packageId && typeof obj.packageId === 'object') {
    const original = obj.packageId;
    obj.packageId = localizePackage(original, lang);
    if (obj.packageName && obj.packageName === original.name) obj.packageName = obj.packageId.name;
  }
  // Dates typed as free text ("Nov 15, 2026") still get Arabic month names.
  obj.date = localizeDateText(lang, obj.date);
  return obj;
}

// Each folder in public/images/city-guides is one guide: its page images in order,
// with optional smaller copies (same file names) in a thumbs/ subfolder.
function loadCityGuides(lang) {
  const root = path.join(__dirname, '..', 'public', 'images', 'city-guides');
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const dir = path.join(root, d.name);
        const thumbsDir = path.join(dir, 'thumbs');
        const thumbs = new Set(fs.existsSync(thumbsDir) ? fs.readdirSync(thumbsDir) : []);
        const pages = fs.readdirSync(dir)
          .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
          .sort()
          .map((f) => ({
            src: `/images/city-guides/${d.name}/${f}`,
            thumb: thumbs.has(f) ? `/images/city-guides/${d.name}/thumbs/${f}` : null,
          }));
        const name = d.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return { slug: d.name, name: place(lang, name), pages };
      })
      .filter((cg) => cg.pages.length)
      .sort((a, b) => a.slug.localeCompare(b.slug));
  } catch (err) {
    return [];
  }
}

const getCityGuidePage = (req, res, next) => {
  const guides = loadCityGuides(req.lang);
  const guide = guides.find((g) => g.slug === req.params.slug);
  if (!guide) return next(new AppError('City guide not found.', 404));
  res.render('cityGuide', {
    user: req.user || null,
    guide,
    otherGuides: guides.filter((g) => g !== guide),
  });
};

const getLandingPage = async (req, res, next) => {
  try {
    const [dayPackages, weekPackages, singlePackages, recentReviews, upcomingTrips, rehlaCities, featuredWeekPackage, featuredSinglePackage] = await Promise.all([
      Package.find({ status: 'active', type: 'day' }).limit(3).sort('-rating'),
      Package.find({ status: 'active', type: 'week' }).limit(3).sort('-rating'),
      Package.find({ status: 'active', type: 'single' }).limit(4).sort('-rating'),
      Review.find().populate('userId', 'name image').sort('-date').limit(6),
      Trip.find({ kind: 'upcoming', status: 'active' }).limit(6).sort('createdAt'),
      Package.find({ status: 'active', type: 'week', city: { $nin: ['', 'TBD'] } }).distinct('city'),

      Package.findOne({ status: 'active', type: 'week', name: 'Dahab' }),
      Package.findOne({ status: 'active', type: 'single', name: 'Kayaking' }),
    ]);

    const lang = req.lang;
    res.render('index', {
      user: req.user || null,
      dayPackages: localizePackages(dayPackages, lang),
      weekPackages: localizePackages(weekPackages, lang),
      singlePackages: localizePackages(singlePackages, lang),
      recentReviews,
      upcomingTrips: localizeTrips(upcomingTrips, lang),
      rehlaCities: rehlaCities.map((city) => place(lang, city)),
      featuredWeekPackage: localizePackage(featuredWeekPackage || weekPackages[0], lang),
      featuredSinglePackage: localizePackage(featuredSinglePackage || singlePackages[0], lang),
      cityGuides: loadCityGuides(lang),
    });
  } catch (err) {
    next(err);
  }
};

const getDayPackages = async (req, res, next) => {
  try {
    const packages = await Package.find({ status: 'active', type: 'day' }).sort('-rating');
    res.render('dayPackages', { user: req.user || null, packages: localizePackages(packages, req.lang) });
  } catch (err) {
    next(err);
  }
};

const getWeekPackages = async (req, res, next) => {
  try {
    const packages = await Package.find({ status: 'active', type: 'week' }).sort('-rating');
    res.render('weekPackages', { user: req.user || null, packages: localizePackages(packages, req.lang) });
  } catch (err) {
    next(err);
  }
};

const getSinglePackages = async (req, res, next) => {
  try {
    const packages = await Package.find({ status: 'active', type: 'single' }).sort('-rating');
    res.render('singlePackages', { user: req.user || null, packages: localizePackages(packages, req.lang) });
  } catch (err) {
    next(err);
  }
};

const getLoginPage = (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { user: null, error: null, googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
};

const getRegisterPage = (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { user: null, error: null, googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
};

const getDashboard = async (req, res, next) => {
  if (req.user.role === 'Admin') return res.redirect('/admin');
  try {
    const [recentBooking, totalBookings, featuredPackage, rehlaPackages] = await Promise.all([
      Booking.findOne({
        userId: req.user._id,
        status: { $nin: ['draft', 'cancelled'] },
      })
        .populate('packageId', 'name type city image ar')
      .populate('tripId', 'title date image location price ar')
        .sort('-createdAt'),
      Booking.countDocuments({
        userId: req.user._id,
        status: { $ne: 'draft' },
      }),
      Package.findOne({ status: 'active', image: { $ne: '' } }).sort('-rating'),
      Package.find({ status: 'active', type: 'week' }).sort('name'),
    ]);

    res.render('userDashboard', {
      user: req.user,
      recentBooking: localizeBooking(recentBooking, req.lang),
      totalBookings,
      featuredPackage: localizePackage(featuredPackage, req.lang),
      rehlaPackages: localizePackages(rehlaPackages, req.lang),
    });
  } catch (err) {
    next(err);
  }
};

const getProfilePage = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id, status: { $ne: 'draft' } })
      .populate('packageId', 'name type city image ar')
      .populate('tripId', 'title date image location price ar')
      .sort('-createdAt');

    res.render('userProfile', { user: req.user, bookings: bookings.map((b) => localizeBooking(b, req.lang)) });
  } catch (err) {
    next(err);
  }
};

const getMyBookingsPage = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id, status: { $ne: 'draft' } })
      .populate('packageId', 'name type city image ar')
      .populate('tripId', 'title date image location price ar')
      .sort('-createdAt');

    const mapped = bookings.map(b => {
      const obj = localizeBooking(b, req.lang);
      obj.computedStatus = effectiveStatus(b);
      return obj;
    });

    // Requests store the destination's English name; show the destination package's Arabic name.
    const tripRequests = (await TripRequest.find({ userId: req.user._id }).populate('destinationId', 'name ar').sort('-createdAt'))
      .map((r) => {
        const obj = r.toObject();
        const destination = obj.destinationId && typeof obj.destinationId === 'object' ? localizePackage(obj.destinationId, req.lang) : null;
        obj.destination = destination && destination.name !== obj.destinationId.name ? destination.name : place(req.lang, obj.destination);
        obj.destinationId = obj.destinationId && obj.destinationId._id ? obj.destinationId._id : obj.destinationId;
        return obj;
      });

    res.render('myBookings', { user: req.user, bookings: mapped, tripRequests });
  } catch (err) {
    next(err);
  }
};

const getBookingSummaryPage = async (req, res, next) => {
  try {
    const draftId = req.query.draftId;
    if (!draftId) return res.redirect('/packages/day');

    const booking = await Booking.findById(draftId).populate('packageId', 'name type city image price ar')
      .populate('tripId', 'title date image location price promoCodes ar');
    if (!booking || booking.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('Booking not found.', 404));
    }

    res.render('bookingSummary', { user: req.user, booking: localizeBooking(booking, req.lang) });
  } catch (err) {
    next(err);
  }
};

const getTravellersPage = async (req, res, next) => {
  try {
    const draftId = req.query.draftId;
    if (!draftId) return res.redirect('/packages/day');

    const booking = await Booking.findById(draftId).populate('packageId', 'name type city ar')
      .populate('tripId', 'title date image location price ar');
    if (!booking || booking.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('Booking not found.', 404));
    }

    res.render('travellers', { user: req.user, booking: localizeBooking(booking, req.lang) });
  } catch (err) {
    next(err);
  }
};

const getBookingDetailsPage = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('packageId', 'name type city image ar')
      .populate('tripId', 'title date image location price ar')
      .populate('userId', 'name email');

    if (!booking) return next(new AppError('Booking not found.', 404));

    const isOwner = booking.userId._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'Admin';

    if (!isOwner && !isAdmin) return next(new AppError('Access denied.', 403));

    res.render('bookingDetails', { user: req.user, booking: localizeBooking(booking, req.lang) });
  } catch (err) {
    next(err);
  }
};

const getWriteReviewPage = async (req, res, next) => {
  try {
    const packages = await Package.find({ status: 'active' }).select('name type city ar');
    res.render('writeReview', { user: req.user, packages: localizePackages(packages, req.lang) });
  } catch (err) {
    next(err);
  }
};

const getCustomTripPage = async (req, res, next) => {
  try {
    const destinations = await Package.find({ status: 'active', type: 'week' })
      .select('name city image description ar')
      .sort('name');
    res.render('customTrip', { user: req.user, destinations: localizePackages(destinations, req.lang) });
  } catch (err) {
    next(err);
  }
};

const getAdminDashboard = async (req, res, next) => {
  try {
    const [totalUsers, totalBookings, revenueResult, activePackages, openTickets, totalReviews, cancelledBookings, recentBookings] =
      await Promise.all([
        User.countDocuments({ role: 'Tourist' }),
        Booking.countDocuments({ status: { $ne: 'cancelled' } }),
        Booking.aggregate([
          { $match: { status: { $ne: 'cancelled' }, paymentStatus: { $in: ['half paid', 'fully paid'] } } },
          { $group: { _id: null, total: { $sum: '$totalPrice' } } },
        ]),
        Package.countDocuments({ status: 'active' }),
        Contact.countDocuments({ status: 'open' }),
        Review.countDocuments(),
        Booking.countDocuments({ status: 'cancelled' }),
        Booking.find({ status: { $ne: 'draft' } })
          .populate('userId', 'name email')
          .sort('-createdAt')
          .limit(5),
      ]);

    const recentBookingsMapped = recentBookings.map(b => {
      const obj = b.toObject();
      obj.computedStatus = effectiveStatus(b);
      return obj;
    });

    res.render('adminDashboard', {
      user: req.user,
      stats: {
        totalUsers,
        totalBookings,
        totalRevenue: revenueResult.length > 0 ? revenueResult[0].total : 0,
        activePackages,
        openTickets,
        totalReviews,
        cancelledBookings,
      },
      recentBookings: recentBookingsMapped,
    });
  } catch (err) {
    next(err);
  }
};

const getAdminBookingsPage = async (req, res, next) => {
  try {
    const filter = { status: { $ne: 'draft' } };
    if (req.query.status === 'cancelled') {
      filter.status = 'cancelled';
    } else if (['verifying', 'half paid', 'verifying payment 2', 'fully paid'].includes(req.query.status)) {
      filter.status = { $ne: 'cancelled' };
      filter.paymentStatus = req.query.status;
    }

    // Independent queries: run them together instead of one round trip at a time.
    const [rawBookings, total, fullyPaid, cancelled, rev] = await Promise.all([
      Booking.find(filter)
        .populate('userId', 'name email image')
        .populate('packageId', 'name type')
        .populate('tripId', 'title date image location price')
        .sort('-createdAt')
        .limit(50),
      Booking.countDocuments({ status: { $ne: 'draft' } }),
      Booking.countDocuments({ status: { $ne: 'cancelled' }, paymentStatus: 'fully paid' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.aggregate([
        { $match: { paymentStatus: { $in: ['half paid', 'verifying payment 2', 'fully paid'] }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } },
      ]),
    ]);

    const bookings = rawBookings.map(b => {
      const obj = b.toObject();
      obj.computedStatus = effectiveStatus(b);
      return obj;
    });

    const stats = { total, fullyPaid, cancelled, revenue: rev.length > 0 ? rev[0].total : 0 };

    res.render('adminBookings', { user: req.user, bookings, stats });
  } catch (err) {
    next(err);
  }
};

const getAdminContactPage = async (req, res, next) => {
  try {
    await Contact.updateMany({ status: 'in-progress' }, { status: 'open' });
    const tickets = await Contact.find().sort('-createdAt');
    res.render('adminContact', { user: req.user, tickets });
  } catch (err) {
    next(err);
  }
};

const getAdminPackagesPage = async (req, res, next) => {
  try {
    const packages = await Package.find().sort('-createdAt');
    res.render('adminPackages', { user: req.user, packages });
  } catch (err) {
    next(err);
  }
};

const getAdminTripsPage = async (req, res, next) => {
  try {
    const trips = await Trip.find().sort('-createdAt');
    res.render('adminTrips', { user: req.user, trips });
  } catch (err) {
    next(err);
  }
};

const getAdminTripRequestsPage = async (req, res, next) => {
  try {
    const requests = await TripRequest.find()
      .populate('userId', 'name email')
      .sort('-createdAt');
    res.render('adminTripRequests', { user: req.user, requests });
  } catch (err) {
    next(err);
  }
};

const getAdminUsersPage = async (req, res, next) => {
  try {
    const users = await User.find().sort('-createdAt');
    res.render('adminUsers', { user: req.user, users });
  } catch (err) {
    next(err);
  }
};

const getAdminReportsPage = async (req, res, next) => {
  try {
    const [allUsers, allBookings, revenueResult, allReviews, openTickets] = await Promise.all([
      User.find().select('name email role status createdAt nationality phone').sort('-createdAt'),
      Booking.find({ status: { $ne: 'draft' } }).populate('packageId', 'name type')
      .populate('tripId', 'title date image location price').sort('-createdAt'),
      Booking.aggregate([
        { $match: { status: { $ne: 'cancelled' }, paymentStatus: { $in: ['half paid', 'fully paid'] } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } },
      ]),
      Review.find().populate('userId', 'name').sort('-createdAt').limit(20),
      Contact.countDocuments({ status: 'open' }),
    ]);

    res.render('adminReports', {
      user: req.user,
      allUsers: allUsers.map(u => ({
        id: String(u._id),
        name: u.name || '',
        email: u.email || '',
        role: u.role === 'Tourist' ? 'user' : 'admin',
        fullRole: u.role,
        status: u.status || 'active',
        nationality: u.nationality || '',
        joinDate: u.createdAt ? u.createdAt.toISOString().split('T')[0] : '',
      })),
      allBookings: allBookings.map(b => ({
        id: String(b._id),
        packageName: b.packageName || (b.tripId && b.tripId.title) || (b.packageId && b.packageId.name) || 'Unknown',
        computedStatus: effectiveStatus(b),
        totalPrice: b.totalPrice || 0,
        date: b.date || '',
        createdAt: b.createdAt ? b.createdAt.toISOString().split('T')[0] : '',
      })),
      allReviews: allReviews.map(r => ({
        id: String(r._id),
        user: r.userId ? r.userId.name : 'Verified Traveler',
        rating: r.rating || 5,
        review: r.text || r.title || '',
        date: r.createdAt ? r.createdAt.toISOString().split('T')[0] : '',
        photos: r.photos || [],
      })),
      totalRevenue: revenueResult.length > 0 ? revenueResult[0].total : 0,
      openTickets,
    });
  } catch (err) {
    next(err);
  }
};

const getContactPage = (req, res) => res.render('contact', { user: req.user || null });
const getAboutPage   = (req, res) => res.render('about',   { user: req.user || null });
const getFaqPage     = (req, res) => res.render('faq',     { user: req.user || null });
const getUpcomingTrips = async (req, res, next) => {
  try {
    const trips = await Trip.find({ kind: 'upcoming', status: 'active' }).sort('createdAt');
    res.render('upcomingTrips', { user: req.user || null, trips: localizeTrips(trips, req.lang) });
  } catch (err) {
    next(err);
  }
};

const getPastTrips = async (req, res, next) => {
  try {
    const trips = localizeTrips(await Trip.find({ kind: 'past', status: 'active' }).sort('-createdAt'), req.lang);

    const gallery = [];
    for (const trip of trips) {
      const loc = (trip.location || place(req.lang, 'Egypt')).trim();
      const photos = [trip.image, ...(trip.gallery || [])].filter(Boolean);
      for (const src of photos) {
        gallery.push({ src, location: loc, title: trip.title, date: trip.date || '' });
      }
    }

    const locations = [...new Set(gallery.map((g) => g.location))].sort((a, b) => a.localeCompare(b));

    res.render('pastTrips', { user: req.user || null, gallery, locations });
  } catch (err) {
    next(err);
  }
};

const getTripDetails = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip || trip.status === 'inactive') return next(new AppError('Trip not found.', 404));
    res.render('tripDetails', { user: req.user || null, trip: localizeTrip(trip, req.lang) });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getLandingPage,
  getDayPackages,
  getWeekPackages,
  getSinglePackages,
  getUpcomingTrips,
  getPastTrips,
  getTripDetails,
  getLoginPage,
  getRegisterPage,
  getDashboard,
  getProfilePage,
  getMyBookingsPage,
  getBookingSummaryPage,
  getTravellersPage,
  getBookingDetailsPage,
  getWriteReviewPage,
  getCustomTripPage,
  getAdminDashboard,
  getAdminBookingsPage,
  getAdminPackagesPage,
  getAdminTripsPage,
  getAdminTripRequestsPage,
  getAdminContactPage,
  getAdminUsersPage,
  getAdminReportsPage,
  getContactPage,
  getAboutPage,
  getFaqPage,
  getCityGuidePage,
};
