const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Trip title is required'],
      trim: true,
    },
    kind: {
      type: String,
      enum: ['upcoming', 'past'],
      required: [true, 'Trip kind is required'],
    },

    category: {
      type: String,
      enum: ['tal3a', 'rehla', 'pump', 'other'],
      default: 'other',
    },
    date: { type: String, default: '' },
    location: { type: String, default: '' },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    gallery: { type: [String], default: [] },
    experiencePhotos: { type: [String], default: [] },
    durationText: { type: String, default: '' },

    price: { type: Number, default: 0, min: [0, 'Price cannot be negative'] },
    capacity: { type: Number, default: null },
    spotsLeft: { type: Number, default: null },
    includedServices: { type: String, default: '' },
    highlights: { type: String, default: '' },

    // Whether travellers may reserve with a partial payment, and how much of the total it is.
    depositEnabled: { type: Boolean, default: true },
    depositPercent: {
      type: Number,
      default: 50,
      min: [1, 'Deposit must be at least 1%'],
      max: [99, 'Deposit must be below 100%'],
    },

    // Accounts customers send this trip's payments to; a blank number hides that method at checkout.
    instapayNumber:     { type: String, default: '', trim: true, maxlength: [60, 'InstaPay number cannot exceed 60 characters'] },
    vodafoneCashNumber: { type: String, default: '', trim: true, maxlength: [60, 'Vodafone Cash number cannot exceed 60 characters'] },

    promoCodes: [
      {
        code:     { type: String, required: true, trim: true, uppercase: true },
        discount: { type: Number, required: true, min: 1, max: 99 },
      },
    ],

    itinerary: [
      {
        day:   { type: Number },
        title: { type: String, default: '' },
        desc:  { type: String, default: '' },
      },
    ],

    status: { type: String, enum: ['active', 'inactive'], default: 'active' },

    // Arabic copies of the customer-facing text; empty fields fall back to the English ones.
    ar: {
      title:            { type: String, default: '', trim: true },
      date:             { type: String, default: '' },
      location:         { type: String, default: '' },
      description:      { type: String, default: '' },
      durationText:     { type: String, default: '' },
      includedServices: { type: String, default: '' },
      highlights:       { type: String, default: '' },
      itinerary: [
        {
          day:   { type: Number },
          title: { type: String, default: '' },
          desc:  { type: String, default: '' },
        },
      ],
    },
  },
  { timestamps: true }
);

tripSchema.index({ kind: 1 });

module.exports = mongoose.model('Trip', tripSchema);
