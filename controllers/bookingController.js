const Booking    = require('../models/Booking');
const Package    = require('../models/Package');
const Trip       = require('../models/Trip');
const TripOption = require('../models/TripOption');
const AppError = require('../utils/AppError');
const { BOOKING_STATUSES } = require('../utils/bookingStatus');

const createDraft = async (req, res, next) => {
  try {
    const { tripId, date, travelers, tier, totalPrice, basePrice, isCustom, packageName, location } = req.body;
    const nTravelers = Math.min(15, Math.max(1, parseInt(travelers, 10) || 1));

    if (tripId) {
      const trip = await Trip.findById(tripId);
      if (!trip || trip.status === 'inactive' || trip.kind !== 'upcoming') {
        return next(new AppError('Trip not found or not open for booking.', 404));
      }
      if (trip.spotsLeft != null && trip.spotsLeft < nTravelers) {
        return next(new AppError(`Only ${trip.spotsLeft} spot${trip.spotsLeft === 1 ? '' : 's'} left on this trip.`, 400));
      }
      const perPerson = trip.price || 0;
      const draft = await Booking.create({
        userId: req.user._id,
        userEmail: req.user.email,
        tripId: trip._id,
        packageName: trip.title,
        packageType: 'trip',
        date: trip.date || date || '',
        travelers: nTravelers,
        totalPrice: perPerson * nTravelers,
        basePrice: perPerson,
        status: 'draft',
        location: trip.location || '',
      });
      return res.status(201).json({ status: 'success', data: { booking: draft, draftId: draft._id } });
    }

    if (!isCustom) {
      return next(new AppError('A trip must be selected to book.', 400));
    }
    const draft = await Booking.create({
      userId: req.user._id,
      userEmail: req.user.email,
      packageId: null,
      packageName: packageName || 'Custom Trip',
      packageType: 'custom',
      date: date || '',
      travelers: nTravelers,
      tier,
      totalPrice: totalPrice || 0,
      basePrice: basePrice || 0,
      status: 'draft',
      isCustom: true,
      location: location || '',
    });

    res.status(201).json({
      status: 'success',
      data: { booking: draft, draftId: draft._id },
    });
  } catch (err) {
    next(err);
  }
};

const getDraft = async (req, res, next) => {
  try {
    const draft = await Booking.findById(req.params.id).populate('packageId', 'name type city image')
      .populate('tripId', 'title date image location price');
    if (!draft) return next(new AppError('Draft booking not found.', 404));

    if (draft.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('You do not have permission to access this booking.', 403));
    }

    res.status(200).json({ status: 'success', data: { booking: draft } });
  } catch (err) {
    next(err);
  }
};

const GENDERS = ['male', 'female'];

function cleanTravellers(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 15).map((t) => ({
    name:           String(t && t.name || '').trim().slice(0, 120),
    phone:          String(t && t.phone || '').trim().slice(0, 30),
    gender:         GENDERS.includes(t && t.gender) ? t.gender : '',
    idNumber:       String(t && t.idNumber || '').trim().slice(0, 40),
    idPhoto:        String(t && t.idPhoto || '').trim().slice(0, 400),
    emergencyName:  String(t && t.emergencyName || '').trim().slice(0, 120),
    emergencyPhone: String(t && t.emergencyPhone || '').trim().slice(0, 30),
    knownDisease:   String(t && t.knownDisease || '').trim().slice(0, 500),
  }));
}

const updateDraft = async (req, res, next) => {
  try {
    const { travellerDetails, paymentMethod, paymentPlan, specialRequests } = req.body;

    const draft = await Booking.findById(req.params.id);
    if (!draft) return next(new AppError('Draft booking not found.', 404));
    if (draft.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('You do not have permission to update this booking.', 403));
    }

    if (travellerDetails) {
      const cleaned = cleanTravellers(travellerDetails);
      const missing = cleaned.some((t) =>
        !t.name || !t.phone || !t.gender || !t.idNumber || !t.idPhoto || !t.emergencyName || !t.emergencyPhone);
      if (cleaned.length < draft.travelers || missing) {
        return next(new AppError('Please complete every traveller’s details, including an ID/passport photo.', 400));
      }
      draft.travellerDetails = cleaned;
    }
    if (paymentMethod !== undefined) {
      if (!['instapay', 'vodafone-cash'].includes(paymentMethod)) {
        return next(new AppError('Please choose a payment method.', 400));
      }
      draft.paymentMethod = paymentMethod;
    }
    if (paymentPlan !== undefined) {
      if (!['deposit', 'full'].includes(paymentPlan)) {
        return next(new AppError('Please choose how much to pay now.', 400));
      }
      draft.paymentPlan = paymentPlan;
    }
    if (specialRequests !== undefined) draft.specialRequests = specialRequests;
    await draft.save();

    res.status(200).json({ status: 'success', data: { booking: draft } });
  } catch (err) {
    next(err);
  }
};

const applyPromoCode = async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();

    const draft = await Booking.findById(req.params.id);
    if (!draft) return next(new AppError('Draft booking not found.', 404));
    if (draft.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('You do not have permission to update this booking.', 403));
    }

    if (!code) {
      draft.promoCode = '';
      draft.promoDiscount = null;
      draft.totalPrice = draft.basePrice * draft.travelers;
      await draft.save();
      return res.status(200).json({ status: 'success', data: { booking: draft } });
    }

    if (!draft.tripId) {
      return next(new AppError('Promo codes are only available for upcoming-trip bookings.', 400));
    }
    const trip = await Trip.findById(draft.tripId);
    if (!trip || !trip.promoCodes || !trip.promoCodes.length) {
      return next(new AppError('No promo code is available for this trip.', 400));
    }
    const match = trip.promoCodes.find((p) => p.code === code);
    if (!match) {
      return next(new AppError('That promo code is not valid.', 400));
    }

    draft.promoCode = match.code;
    draft.promoDiscount = match.discount;
    draft.totalPrice = Math.round(draft.basePrice * draft.travelers * (1 - match.discount / 100));
    await draft.save();

    res.status(200).json({ status: 'success', data: { booking: draft } });
  } catch (err) {
    next(err);
  }
};

const uploadTravellerPhoto = async (req, res, next) => {
  try {
    const draft = await Booking.findById(req.params.id).select('userId');
    if (!draft) return next(new AppError('Booking not found.', 404));
    if (draft.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('You do not have permission to update this booking.', 403));
    }
    if (!req.file) return next(new AppError('Please choose an image to upload.', 400));
    res.status(200).json({ status: 'success', data: { url: req.file.path } });
  } catch (err) {
    next(err);
  }
};

const uploadPaymentScreenshot = async (req, res, next) => {
  try {
    const draft = await Booking.findById(req.params.id).select('userId');
    if (!draft) return next(new AppError('Booking not found.', 404));
    if (draft.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('You do not have permission to update this booking.', 403));
    }
    if (!req.file) return next(new AppError('Please choose an image to upload.', 400));

    draft.paymentScreenshot = req.file.path;
    await draft.save();

    res.status(200).json({ status: 'success', data: { url: req.file.path } });
  } catch (err) {
    next(err);
  }
};

const uploadSecondPaymentScreenshot = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(new AppError('Booking not found.', 404));
    if (booking.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('You do not have permission to update this booking.', 403));
    }
    if (booking.paymentStatus !== 'half paid') {
      return next(new AppError('This booking is not awaiting a second payment.', 400));
    }
    if (!req.file) return next(new AppError('Please choose an image to upload.', 400));

    booking.paymentScreenshot2 = req.file.path;
    booking.paymentStatus = 'verifying payment 2';
    await booking.save();

    res.status(200).json({
      status: 'success',
      data: { url: req.file.path, paymentStatus: booking.paymentStatus },
    });
  } catch (err) {
    next(err);
  }
};

const confirmBooking = async (req, res, next) => {
  try {
    const draft = await Booking.findById(req.params.id);
    if (!draft) return next(new AppError('Booking not found.', 404));
    if (draft.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('You do not have permission to confirm this booking.', 403));
    }
    if (draft.status !== 'draft') {
      return next(new AppError('This booking is already confirmed or cancelled.', 400));
    }
    if (!draft.paymentScreenshot) {
      return next(new AppError('Please upload your payment screenshot before confirming.', 400));
    }

    if (draft.tripId) {
      const trip = await Trip.findById(draft.tripId);
      if (trip && trip.spotsLeft != null) {
        if (trip.spotsLeft < draft.travelers) {
          return next(new AppError(`Sorry — only ${trip.spotsLeft} spot${trip.spotsLeft === 1 ? '' : 's'} left. Please adjust your booking.`, 400));
        }
        trip.spotsLeft -= draft.travelers;
        await trip.save();
      }
    }

    draft.status = 'confirmed';
    draft.paymentStatus = 'verifying';
    await draft.save();

    const populated = await Booking.findById(draft._id)
      .populate('packageId', 'name type city image')
      .populate('tripId', 'title date image location price');

    res.status(200).json({ status: 'success', data: { booking: populated } });
  } catch (err) {
    next(err);
  }
};

const getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({
      userId: req.user._id,
      status: { $ne: 'draft' },
    })
      .populate('packageId', 'name type city image')
      .populate('tripId', 'title date image location price')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      data: { bookings },
    });
  } catch (err) {
    next(err);
  }
};

const getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('packageId', 'name type city image')
      .populate('tripId', 'title date image location price');
    if (!booking) return next(new AppError('Booking not found.', 404));

    const isOwner = booking.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return next(new AppError('You do not have permission to view this booking.', 403));
    }

    res.status(200).json({ status: 'success', data: { booking } });
  } catch (err) {
    next(err);
  }
};

const cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(new AppError('Booking not found.', 404));

    const isOwner = booking.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return next(new AppError('You do not have permission to cancel this booking.', 403));
    }

    if (booking.status === 'cancelled') {
      return next(new AppError('This booking is already cancelled.', 400));
    }

    if (booking.tripId && booking.status === 'confirmed') {
      const trip = await Trip.findById(booking.tripId);
      if (trip && trip.spotsLeft != null) {
        trip.spotsLeft += booking.travelers;
        await trip.save();
      }
    }

    booking.status = 'cancelled';
    booking.cancellationReason = req.body.reason || '';
    await booking.save();

    res.status(200).json({ status: 'success', data: { booking } });
  } catch (err) {
    next(err);
  }
};

const getAllBookings = async (req, res, next) => {
  try {
    const filter = { status: { $ne: 'draft' } };
    if (req.query.status === 'cancelled') {
      filter.status = 'cancelled';
    } else if (['verifying', 'half paid', 'verifying payment 2', 'fully paid'].includes(req.query.status)) {
      filter.status = { $ne: 'cancelled' };
      filter.paymentStatus = req.query.status;
    }
    if (req.query.type) filter.packageType = req.query.type;

    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip  = (page - 1) * limit;

    const bookings = await Booking.find(filter)
      .populate('userId', 'name email image')
      .populate('packageId', 'name type city')
      .populate('tripId', 'title date image location price')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      total,
      data: { bookings },
    });
  } catch (err) {
    next(err);
  }
};

const updateBookingStatus = async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    if (!BOOKING_STATUSES.includes(status)) {
      return next(new AppError('Invalid booking status.', 400));
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return next(new AppError('Booking not found.', 404));

    if (status === 'cancelled') {
      if (booking.status !== 'cancelled' && booking.tripId) {
        const trip = await Trip.findById(booking.tripId);
        if (trip && trip.spotsLeft != null) {
          trip.spotsLeft += booking.travelers;
          await trip.save();
        }
      }
      booking.status = 'cancelled';
      if (reason) booking.cancellationReason = reason;
    } else {
      booking.status = 'confirmed';
      booking.paymentStatus = status;
    }
    await booking.save();

    const populated = await Booking.findById(booking._id)
      .populate('userId', 'name email')
      .populate('packageId', 'name type')
      .populate('tripId', 'title date image location price');

    res.status(200).json({ status: 'success', data: { booking: populated } });
  } catch (err) {
    next(err);
  }
};

const getTripOptions = async (req, res, next) => {
  try {
    const options = await TripOption.find().sort('type');
    res.status(200).json({
      status: 'success',
      data: {
        destinations:   options.filter(o => o.type === 'destination'),
        accommodations: options.filter(o => o.type === 'accommodation'),
        rooms:          options.filter(o => o.type === 'room'),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createDraft,
  getDraft,
  updateDraft,
  applyPromoCode,
  uploadTravellerPhoto,
  uploadPaymentScreenshot,
  uploadSecondPaymentScreenshot,
  confirmBooking,
  getMyBookings,
  getBooking,
  cancelBooking,
  getAllBookings,
  updateBookingStatus,
  getTripOptions,
};
