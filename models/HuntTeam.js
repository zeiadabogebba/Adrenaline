const mongoose = require('mongoose');

// One team's run on a trip's hunt. The clock is server-side: it starts when the first
// member starts, and stops when anyone on the team claims the finish.
const huntTeamSchema = new mongoose.Schema(
  {
    tripId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
    presetId: { type: mongoose.Schema.Types.ObjectId, ref: 'HuntPreset', required: true },
    routeId:  { type: mongoose.Schema.Types.ObjectId, required: true },
    code:     { type: String, required: true, uppercase: true, trim: true }, // team ID, shared with teammates
    busId:    { type: mongoose.Schema.Types.ObjectId, default: null }, // the trip bus the team picked
    busName:  { type: String, default: '' },
    members:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    startedAt:  { type: Date, required: true },
    progress:   { type: Number, default: 0 }, // legs cleared, the finish included
    splits:     { type: [Number], default: [] }, // ms since start at each clear
    finishedAt: { type: Date, default: null },
    elapsedMs:  { type: Number, default: null },
    hintsUsed:  { type: [Number], default: [] }, // leg indexes whose extra hint was revealed
    // Selfie hunts: the team's latest selfie at each stop. `at` is ms since start. The clock
    // stops when every stop has a selfie that isn't rejected; a rejected one has to be retaken.
    selfies: {
      type: [{
        _id: false,
        leg:       { type: Number, required: true },
        url:       { type: String, required: true },
        publicId:  { type: String, default: '' },
        at:        { type: Number, required: true },
        by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        status:    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        reviewedAt: { type: Date, default: null },
      }],
      default: [],
    },
  },
  { timestamps: true }
);

huntTeamSchema.index({ tripId: 1, code: 1 }, { unique: true });
huntTeamSchema.index({ tripId: 1, members: 1 });
huntTeamSchema.index({ tripId: 1, elapsedMs: 1 });

module.exports = mongoose.model('HuntTeam', huntTeamSchema);
