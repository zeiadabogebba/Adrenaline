const mongoose = require('mongoose');

// A traveller's answer to the "review your trip" pop-up: later (until a date) or never.
const reviewPromptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
    snoozedUntil: { type: Date, default: null },
    never: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewPromptSchema.index({ userId: 1, tripId: 1 }, { unique: true });

module.exports = mongoose.model('ReviewPrompt', reviewPromptSchema);
