const mongoose = require('mongoose');
const Review = require('../models/review');
const Package = require('../models/Package');
const Trip = require('../models/Trip');
const Booking = require('../models/Booking');
const AppError = require('../utils/AppError');

const LIVE_BOOKING = { $nin: ['draft', 'cancelled'] };
const isId = (v) => mongoose.isValidObjectId(v);

// Travellers review a trip (or package) they booked, once each.
const createReview = async (req, res, next) => {
  try {
    const { tripId, packageId, rating, title, text, photosCount } = req.body;
    const target = tripId ? { tripId } : { packageId };
    const key = tripId ? 'tripId' : 'packageId';
    if (!isId(target[key])) return next(new AppError('Choose the trip you are reviewing.', 400));

    const booked = await Booking.exists({ userId: req.user._id, status: LIVE_BOOKING, [key]: target[key] });
    if (!booked) return next(new AppError('You can only review a trip you booked.', 403));
    const exists = tripId ? await Trip.exists({ _id: tripId }) : await Package.exists({ _id: packageId });
    if (!exists) return next(new AppError('Trip not found.', 404));

    const existing = await Review.findOne({ ...target, userId: req.user._id });
    if (existing) return next(new AppError('You have already reviewed this trip.', 400));

    const review = await Review.create({
      ...target,
      userId: req.user._id,
      email: req.user.email,
      rating,
      title,
      text,
      photosCount: photosCount || 0,
    });

    res.status(201).json({ status: 'success', data: { review } });
  } catch (err) {
    if (err.code === 11000) return next(new AppError('You have already reviewed this trip.', 400));
    next(err);
  }
};

const getPackageReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ packageId: req.params.packageId })
      .populate('userId', 'name image')
      .sort('-date');

    res.status(200).json({
      status: 'success',
      results: reviews.length,
      data: { reviews },
    });
  } catch (err) {
    next(err);
  }
};

const getAllReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find()
      .populate('userId', 'name email image')
      .populate('packageId', 'name type')
      .populate('tripId', 'title date')
      .sort('-date');

    res.status(200).json({
      status: 'success',
      results: reviews.length,
      data: { reviews },
    });
  } catch (err) {
    next(err);
  }
};

const getMyReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ userId: req.user._id })
      .populate('packageId', 'name type')
      .populate('tripId', 'title date')
      .sort('-date');
    res.status(200).json({ status: 'success', data: { reviews } });
  } catch (err) {
    next(err);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return next(new AppError('Review not found.', 404));

    const isOwner = review.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return next(new AppError('You do not have permission to delete this review.', 403));
    }

    await Review.findOneAndDelete({ _id: req.params.id });

    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
};

const uploadReviewPhotos = async (req, res, next) => {
  try {
    const photos = req.files ? req.files.map(f => f.path) : [];
    const review = await Review.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { photos, photosCount: photos.length },
      { new: true }
    );
    if (!review) return next(new AppError('Review not found.', 404));
    res.status(200).json({ status: 'success', data: { review } });
  } catch (err) {
    next(err);
  }
};

module.exports = { createReview, getPackageReviews, getAllReviews, getMyReviews, deleteReview, uploadReviewPhotos };
