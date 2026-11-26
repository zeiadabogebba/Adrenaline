const mongoose = require('mongoose');

// Treasure hunt settings for one trip. Kept apart from Trip so trips are never modified.
const huntTripSchema = new mongoose.Schema(
  {
    tripId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, unique: true },
    presetId: { type: mongoose.Schema.Types.ObjectId, ref: 'HuntPreset', default: null },
    enabled:  { type: Boolean, default: false }, // travellers booked on the trip can see it
    open:     { type: Boolean, default: false }, // teams can start and claim checkpoints
  },
  { timestamps: true }
);

module.exports = mongoose.model('HuntTrip', huntTripSchema);
