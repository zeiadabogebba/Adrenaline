const mongoose = require('mongoose');

// Per-trip switches for the electronic photo book. Kept in its own collection
// so turning photo books on never touches the Trip documents themselves.
const photoBookTripSchema = new mongoose.Schema(
  {
    tripId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, unique: true },
    enabled:         { type: Boolean, default: false }, // travellers on this trip can see their photo book
    submissionsOpen: { type: Boolean, default: false }, // travellers can still add or remove pages
  },
  { timestamps: true }
);

module.exports = mongoose.model('PhotoBookTrip', photoBookTripSchema);
