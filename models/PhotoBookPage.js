const mongoose = require('mongoose');

// One page of a traveller's photo book for one trip.
const photoBookPageSchema = new mongoose.Schema(
  {
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tripId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
    destination:   { type: String, default: '', trim: true, maxlength: [60, 'Destination cannot exceed 60 characters'] },
    caption:       { type: String, default: '', trim: true, maxlength: [200, 'The sentence cannot exceed 200 characters'] },
    photo:         { type: String, required: [true, 'A photo is required'] },
    photoPublicId: { type: String, default: '' },
  },
  { timestamps: true }
);

photoBookPageSchema.index({ userId: 1, tripId: 1, createdAt: 1 });
photoBookPageSchema.index({ tripId: 1 });

module.exports = mongoose.model('PhotoBookPage', photoBookPageSchema);
