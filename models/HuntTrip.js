const mongoose = require('mongoose');

// Treasure hunt settings for one trip. Kept apart from Trip so trips are never modified.
const huntTripSchema = new mongoose.Schema(
  {
    tripId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, unique: true },
    presetId: { type: mongoose.Schema.Types.ObjectId, ref: 'HuntPreset', default: null },
    enabled:  { type: Boolean, default: false }, // travellers booked on the trip can see it
    open:     { type: Boolean, default: false }, // teams can start and claim checkpoints
    // Which preset route each of the trip's buses takes; unset buses go bus 1 -> route 1, ...
    busRoutes: [{ _id: false, busId: { type: mongoose.Schema.Types.ObjectId, required: true }, routeId: { type: mongoose.Schema.Types.ObjectId, required: true } }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('HuntTrip', huntTripSchema);
