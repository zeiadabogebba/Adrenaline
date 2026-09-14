const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: {
      type: String,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    userEmail: {
      type: String,
      required: [true, 'User email is required'],
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Package',
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
    },
    packageName: {
      type: String,
      required: [true, 'Package name is required'],
    },
    packageType: {
      type: String,
      enum: ['day', 'week', 'single', 'custom', 'trip'],
      default: 'day',
    },
    date: {
      type: String,
      default: '',
    },
    startDate: { type: Date },
    endDate:   { type: Date },
    travelers: {
      type: Number,
      required: [true, 'Number of travelers is required'],
      min: [1, 'At least 1 traveler is required'],
      max: [15, 'Maximum 15 travelers allowed'],
    },
    tier: {
      type: String,
      enum: ['standard', 'deluxe', 'full', 'Architect Custom', ''],
      default: 'standard',
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
    },
    basePrice: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ['draft', 'confirmed', 'cancelled'],
      default: 'draft',
    },

    paymentStatus: {
      type: String,
      enum: ['verifying', 'half paid', 'verifying payment 2', 'fully paid'],
      default: 'verifying',
    },
    paymentScreenshot: {
      type: String,
      default: '',
    },
    paymentScreenshot2: {
      type: String,
      default: '',
    },
    paymentReference: {
      type: String,
      default: '',
    },
    paymentSource: {
      type: String,
      default: '',
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
    location: {
      type: String,
      default: '',
    },
    travellerDetails: [
      {
        name:           { type: String, default: '' },
        phone:          { type: String, default: '' },
        gender:         { type: String, enum: ['male', 'female', ''], default: '' },
        idNumber:       { type: String, default: '' },
        idPhoto:        { type: String, default: '' },
        emergencyName:  { type: String, default: '' },
        emergencyPhone: { type: String, default: '' },
        knownDisease:   { type: String, default: '' },
      },
    ],
    paymentMethod: {
      type: String,
      enum: ['instapay', 'vodafone-cash', ''],
      default: '',
    },
    paymentPlan: {
      type: String,
      enum: ['deposit', 'full', ''],
      default: '',
    },
    specialRequests: {
      type: String,
      default: '',
    },

    promoCode: {
      type: String,
      default: '',
    },
    promoDiscount: {
      type: Number,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

bookingSchema.pre('save', async function (next) {
  if (!this.bookingNumber) {
    const year   = new Date().getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000);
    this.bookingNumber = `ADR-${year}-${random}`;
  }
  next();
});

bookingSchema.index({ userId: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ bookingNumber: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
