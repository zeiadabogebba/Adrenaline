const Trip = require('../models/Trip');
const AppError = require('../utils/AppError');

const TRIP_FIELDS = [
  'title', 'kind', 'category', 'date', 'location', 'description', 'image',
  'durationText', 'price', 'capacity', 'spotsLeft', 'includedServices',
  'highlights', 'status',
];

const AR_TEXT_FIELDS = ['title', 'date', 'location', 'description', 'durationText', 'includedServices', 'highlights'];

function pickTripData(body) {
  const data = {};
  for (const key of TRIP_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (body.itinerary !== undefined) {
    const rows = Array.isArray(body.itinerary) ? body.itinerary : [];
    data.itinerary = rows
      .map((r, i) => ({
        day: Number(r && r.day) || i + 1,
        title: String((r && r.title) || '').trim(),
        desc: String((r && r.desc) || '').trim(),
      }))
      .filter((r) => r.title || r.desc);
  }
  if (body.promoCodes !== undefined) {
    const rows = Array.isArray(body.promoCodes) ? body.promoCodes : [];
    const seen = new Set();
    data.promoCodes = rows
      .map((r) => ({
        code: String((r && r.code) || '').trim().toUpperCase(),
        discount: Number(r && r.discount),
      }))
      .filter((r) => r.code && Number.isFinite(r.discount) && r.discount >= 1 && r.discount <= 99)
      .filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)));
  }
  if (body.ar !== undefined) {
    const ar = body.ar && typeof body.ar === 'object' ? body.ar : {};
    data.ar = {};
    for (const key of AR_TEXT_FIELDS) data.ar[key] = String(ar[key] || '').trim();
    data.ar.itinerary = (Array.isArray(ar.itinerary) ? ar.itinerary : [])
      .map((r, i) => ({
        day: Number(r && r.day) || i + 1,
        title: String((r && r.title) || '').trim(),
        desc: String((r && r.desc) || '').trim(),
      }))
      .filter((r) => r.title || r.desc);
  }
  if (body.gallery !== undefined) {
    data.gallery = (Array.isArray(body.gallery) ? body.gallery : [])
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .slice(0, 40);
  }
  if (body.experiencePhotos !== undefined) {
    data.experiencePhotos = (Array.isArray(body.experiencePhotos) ? body.experiencePhotos : [])
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .slice(0, 40);
  }
  return data;
}

const getAllTrips = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.kind) filter.kind = req.query.kind;
    const trips = await Trip.find(filter).sort('-createdAt');
    res.status(200).json({ status: 'success', results: trips.length, data: { trips } });
  } catch (err) {
    next(err);
  }
};

const getTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return next(new AppError('Trip not found.', 404));
    res.status(200).json({ status: 'success', data: { trip } });
  } catch (err) {
    next(err);
  }
};

const createTrip = async (req, res, next) => {
  try {
    const data = pickTripData(req.body);
    if (data.capacity != null && data.spotsLeft == null) data.spotsLeft = data.capacity;
    const trip = await Trip.create(data);
    res.status(201).json({ status: 'success', data: { trip } });
  } catch (err) {
    next(err);
  }
};

const updateTrip = async (req, res, next) => {
  try {
    const data = pickTripData(req.body);
    const trip = await Trip.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!trip) return next(new AppError('Trip not found.', 404));
    res.status(200).json({ status: 'success', data: { trip } });
  } catch (err) {
    next(err);
  }
};

const deleteTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findByIdAndDelete(req.params.id);
    if (!trip) return next(new AppError('Trip not found.', 404));
    res.status(200).json({ status: 'success', message: 'Trip deleted successfully.', data: null });
  } catch (err) {
    next(err);
  }
};

const uploadTripImage = async (req, res, next) => {
  try {
    if (!req.file) return next(new AppError('Please upload an image file.', 400));
    const imageUrl = req.file.path;
    const trip = await Trip.findByIdAndUpdate(req.params.id, { image: imageUrl }, { new: true });
    if (!trip) return next(new AppError('Trip not found.', 404));
    res.status(200).json({ status: 'success', data: { trip, imageUrl } });
  } catch (err) {
    next(err);
  }
};

const uploadGalleryPhoto = async (req, res, next) => {
  try {
    if (!req.file) return next(new AppError('Please upload an image file.', 400));
    res.status(200).json({ status: 'success', data: { url: req.file.path } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllTrips,
  getTrip,
  createTrip,
  updateTrip,
  deleteTrip,
  uploadTripImage,
  uploadGalleryPhoto,
};
