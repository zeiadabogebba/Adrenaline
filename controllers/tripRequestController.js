const TripRequest = require('../models/TripRequest');
const Package = require('../models/Package');
const AppError = require('../utils/AppError');

const ROOM_TYPES = ['single', 'double', 'triple', 'quadruple'];

function parseDateOnly(str) {
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

const GENDERS = ['male', 'female'];

const createRequest = async (req, res, next) => {
  try {
    const { destinationId, startDate, endDate, travelers, rooms, notes, travellerDetails } = req.body;

    const pkg = await Package.findOne({ _id: destinationId, type: 'week', status: 'active' });
    if (!pkg) return next(new AppError('Please choose a destination from the list.', 400));

    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) return next(new AppError('Please provide valid start and end dates.', 400));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) return next(new AppError('The start date cannot be in the past.', 400));

    const nights = Math.round((end - start) / 86400000);
    if (nights < 1) return next(new AppError('The end date must be after the start date.', 400));
    if (nights > 14) return next(new AppError('The trip cannot be longer than 14 nights.', 400));

    const nTravelers = parseInt(travelers, 10);
    if (!nTravelers || nTravelers < 1 || nTravelers > 15) {
      return next(new AppError('Please choose between 1 and 15 travellers.', 400));
    }

    const roomList = Array.isArray(rooms) ? rooms : [];
    const cleanRooms = roomList
      .map((r) => (typeof r === 'string' ? r : r && r.type))
      .filter((t) => ROOM_TYPES.includes(t))
      .map((t) => ({ type: t }));

    if (!cleanRooms.length) return next(new AppError('Please pick a type for at least one room.', 400));
    if (cleanRooms.length !== roomList.length) {
      return next(new AppError('Please pick a type for every room.', 400));
    }
    if (cleanRooms.length > 10) return next(new AppError('A maximum of 10 rooms can be requested.', 400));

    const detailsList = Array.isArray(travellerDetails) ? travellerDetails : [];
    if (detailsList.length !== nTravelers) {
      return next(new AppError('Please provide details for every traveller.', 400));
    }
    const cleanTravellerDetails = [];
    for (const d of detailsList) {
      const name = (d && d.name || '').toString().trim();
      const phone = (d && d.phone || '').toString().trim();
      const gender = d && d.gender;
      const idNumber = (d && d.idNumber || '').toString().trim();
      const idPhoto = (d && d.idPhoto || '').toString().trim();
      const emergencyName = (d && d.emergencyName || '').toString().trim();
      const emergencyPhone = (d && d.emergencyPhone || '').toString().trim();
      const knownDisease = (d && d.knownDisease || '').toString().trim();
      if (!name || !phone || !GENDERS.includes(gender) || !idNumber || !idPhoto || !emergencyName || !emergencyPhone) {
        return next(new AppError('Please complete all required fields for every traveller.', 400));
      }
      cleanTravellerDetails.push({ name, phone, gender, idNumber, idPhoto, emergencyName, emergencyPhone, knownDisease });
    }

    const request = await TripRequest.create({
      userId: req.user._id,
      userName: req.user.name || '',
      userEmail: req.user.email,
      destinationId: pkg._id,
      destination: pkg.name,
      startDate,
      endDate,
      nights,
      travelers: nTravelers,
      rooms: cleanRooms,
      travellerDetails: cleanTravellerDetails,
      notes: (notes || '').toString().trim().slice(0, 1000),
    });

    res.status(201).json({
      status: 'success',
      message: 'Thanks for your request — someone from our team will reach out soon.',
      data: { request },
    });
  } catch (err) {
    next(err);
  }
};

const uploadTravellerPhoto = async (req, res, next) => {
  try {
    if (!req.file) return next(new AppError('Please choose an image to upload.', 400));
    res.status(200).json({ status: 'success', data: { url: req.file.path } });
  } catch (err) {
    next(err);
  }
};

const getAllRequests = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const requests = await TripRequest.find(filter)
      .populate('userId', 'name email')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: requests.length,
      data: { requests },
    });
  } catch (err) {
    next(err);
  }
};

const cancelRequest = async (req, res, next) => {
  try {
    const request = await TripRequest.findById(req.params.id);
    if (!request) return next(new AppError('Trip request not found.', 404));
    if (request.userId.toString() !== req.user._id.toString()) {
      return next(new AppError('You do not have permission to cancel this request.', 403));
    }
    if (['closed', 'cancelled'].includes(request.status)) {
      return next(new AppError('This request can no longer be cancelled.', 400));
    }

    request.status = 'cancelled';
    await request.save();

    res.status(200).json({ status: 'success', data: { request } });
  } catch (err) {
    next(err);
  }
};

const updateRequestStatus = async (req, res, next) => {
  try {
    const { status, adminNote } = req.body;
    const update = {};
    if (status) {
      if (!['new', 'contacted', 'closed', 'cancelled'].includes(status)) {
        return next(new AppError('Invalid status.', 400));
      }
      update.status = status;
    }
    if (adminNote !== undefined) update.adminNote = String(adminNote).slice(0, 2000);

    const request = await TripRequest.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!request) return next(new AppError('Trip request not found.', 404));

    res.status(200).json({ status: 'success', data: { request } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRequest,
  uploadTravellerPhoto,
  cancelRequest,
  getAllRequests,
  updateRequestStatus,
};
