const mongoose = require('mongoose');

const ROOM_TYPES = ['single', 'double', 'triple', 'quadruple'];

const tripRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    userName:  { type: String, default: '' },
    userEmail: { type: String, required: [true, 'User email is required'] },

    destinationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', default: null },
    destination:   { type: String, required: [true, 'A destination is required'], trim: true },

    startDate: { type: String, required: [true, 'A start date is required'] },
    endDate:   { type: String, required: [true, 'An end date is required'] },
    nights:    { type: Number, default: 0, min: 0 },

    travelers: {
      type: Number,
      required: [true, 'Number of travellers is required'],
      min: [1, 'At least 1 traveller is required'],
      max: [15, 'Maximum 15 travellers allowed'],
    },

    rooms: {
      type: [
        {
          type: {
            type: String,
            enum: ROOM_TYPES,
            required: true,
          },
        },
      ],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 10,
        message: 'Between 1 and 10 rooms are required.',
      },
    },

    travellerDetails: {
      type: [
        {
          name:           { type: String, required: true, trim: true },
          phone:          { type: String, required: true, trim: true },
          gender:         { type: String, enum: ['male', 'female'], required: true },
          idNumber:       { type: String, required: true, trim: true },
          idPhoto:        { type: String, required: true },
          emergencyName:  { type: String, required: true, trim: true },
          emergencyPhone: { type: String, required: true, trim: true },
          knownDisease:   { type: String, default: '', trim: true },
        },
      ],
      default: [],
    },

    notes: { type: String, default: '', maxlength: 1000 },

    status: {
      type: String,
      enum: ['new', 'contacted', 'closed', 'cancelled'],
      default: 'new',
    },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

tripRequestSchema.index({ status: 1 });
tripRequestSchema.index({ userId: 1 });

module.exports = mongoose.model('TripRequest', tripRequestSchema);
module.exports.ROOM_TYPES = ROOM_TYPES;
