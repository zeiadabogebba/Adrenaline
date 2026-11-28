const mongoose = require('mongoose');
const Package = require('./Package');

const reviewSchema = new mongoose.Schema(
  {
    // A review is for one thing the traveller booked: a trip, or (older reviews) a package.
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', default: undefined },
    tripId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: undefined },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    email:  { type: String, default: '' },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    title: {
      type: String,
      required: [true, 'Review title is required'],
      maxlength: [100, 'Title cannot exceed 100 characters'],
      trim: true,
    },
    text: {
      type: String,
      required: [true, 'Review text is required'],
      maxlength: [2000, 'Review cannot exceed 2000 characters'],
      minlength: [10, 'Review must be at least 10 characters'],
    },
    // The bus the traveller was on, and their rating of each usher on it (names kept as written then).
    busId:   { type: mongoose.Schema.Types.ObjectId, default: undefined },
    busName: { type: String, default: undefined },
    usherRatings: {
      type: [
        {
          _id: false,
          usherId: { type: mongoose.Schema.Types.ObjectId, required: true },
          name:    { type: String, required: true, maxlength: 60 },
          rating:  { type: Number, required: true, min: 1, max: 5 },
          comment: { type: String, default: '', trim: true, maxlength: 500 },
        },
      ],
      default: undefined,
    },
    // Hidden by an admin: kept, but left off the public site and out of package ratings.
    hidden:      { type: Boolean, default: false },
    photos:      [{ type: String }],
    photosCount: { type: Number, default: 0 },
    date:        { type: Date, default: Date.now },
  },
  // Indexes are managed by updateIndexes() at startup (it replaces the old package-only index).
  { timestamps: true, autoIndex: false }
);

reviewSchema.pre('validate', function (next) {
  if (!this.packageId === !this.tripId) this.invalidate('tripId', 'Choose the trip you are reviewing.');
  next();
});

// One review per traveller per trip, and per package. Partial, so reviews without a
// packageId (trip reviews) don't collide with each other.
reviewSchema.index({ packageId: 1, userId: 1 }, { unique: true, name: 'package_user_unique', partialFilterExpression: { packageId: { $type: 'objectId' } } });
reviewSchema.index({ tripId: 1, userId: 1 }, { unique: true, name: 'trip_user_unique', partialFilterExpression: { tripId: { $type: 'objectId' } } });

reviewSchema.statics.calcAverageRating = async function (packageId) {
  if (!packageId) return; // trip reviews don't feed package ratings
  const stats = await this.aggregate([
    { $match: { packageId, hidden: { $ne: true } } },
    {
      $group: {
        _id: '$packageId',
        avgRating:  { $avg: '$rating' },
        numReviews: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await Package.findByIdAndUpdate(packageId, {
      rating:      Math.round(stats[0].avgRating * 10) / 10,
      reviewCount: stats[0].numReviews,
    });
  } else {
    await Package.findByIdAndUpdate(packageId, { rating: 0, reviewCount: 0 });
  }
};

reviewSchema.post('save', function () {
  this.constructor.calcAverageRating(this.packageId);
});

reviewSchema.post('findOneAndDelete', function (doc) {
  if (doc) doc.constructor.calcAverageRating(doc.packageId);
});

const Review = mongoose.model('Review', reviewSchema);

// The original index allowed one review per user per package and treated a missing packageId
// as a value, which would block a second trip review. Swap it for the partial indexes above.
// Only indexes change; no review is touched.
Review.updateIndexes = async function updateIndexes() {
  let existing = [];
  try {
    existing = await Review.collection.indexes();
  } catch (err) {
    if (err.codeName !== 'NamespaceNotFound') throw err;
  }
  const old = existing.find((i) => i.name === 'packageId_1_userId_1' && !i.partialFilterExpression);
  if (old) {
    await Review.collection.dropIndex(old.name);
    console.log('[reviews] replaced the package-only review index');
  }
  await Review.createIndexes();
};

module.exports = Review;
