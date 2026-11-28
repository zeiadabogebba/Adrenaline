const mongoose = require('mongoose');

// A reusable treasure hunt: one or more colour routes that all end at a shared finish.
// Each route is a list of legs. To reach leg N a team gets its riddle (printed on the QR
// at the previous stop, or on the start card for leg 1), a route guide, and an extra hint.
// `code` is the secret printed under the QR at that stop; scanning it clears the leg.
// A clue can be text, a photo, or both. In selfie mode every clue is shown at once and the
// team uploads a selfie at each stop instead of scanning.

const legSchema = new mongoose.Schema({
  place:     { type: String, trim: true, maxlength: 120, default: '' }, // admin/volunteers only (the answer)
  placement: { type: String, trim: true, maxlength: 200, default: '' }, // where the QR is stuck (admin only)
  riddle:    { type: String, trim: true, maxlength: 600, default: '' },
  guide:     { type: String, trim: true, maxlength: 600, default: '' }, // directions, distance, streets
  extraHint: { type: String, trim: true, maxlength: 400, default: '' }, // costs a lifeline
  photo:     { type: String, default: '' },
  photoPublicId: { type: String, default: '' },
  code:      { type: String, required: true, uppercase: true, trim: true },
  // Selfie hunts: what the team sends at this stop. `answerPrompt` is the question it sees;
  // `answerKey` is the expected answer, shown only to admins when they check.
  proof:        { type: String, enum: ['photo', 'answer', 'both'], default: 'photo' },
  answerPrompt: { type: String, trim: true, maxlength: 300, default: '' },
  answerKey:    { type: String, trim: true, maxlength: 300, default: '' },
});

const routeSchema = new mongoose.Schema({
  name:  { type: String, trim: true, maxlength: 80, required: true },
  color: { type: String, trim: true, match: /^#[0-9a-fA-F]{6}$/, default: '#DC2626' },
  label: { type: String, trim: true, maxlength: 8, default: '' }, // printed prefix, e.g. R1
  legs:  { type: [legSchema], default: [] },
  // The last leg (to the shared finish) has route-specific directions.
  finishRiddle:    { type: String, trim: true, maxlength: 600, default: '' },
  finishGuide:     { type: String, trim: true, maxlength: 600, default: '' },
  finishExtraHint: { type: String, trim: true, maxlength: 400, default: '' },
  finishPhoto:     { type: String, default: '' },
  finishPhotoPublicId: { type: String, default: '' },
  finishProof:        { type: String, enum: ['photo', 'answer', 'both'], default: 'photo' },
  finishAnswerPrompt: { type: String, trim: true, maxlength: 300, default: '' },
  finishAnswerKey:    { type: String, trim: true, maxlength: 300, default: '' },
});

const huntPresetSchema = new mongoose.Schema(
  {
    name:        { type: String, trim: true, maxlength: 100, required: [true, 'Give the preset a name'] },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    // How a team proves it reached a stop: scan the QR there, or take a selfie there that an
    // admin checks later. Presets made before this setting are QR hunts.
    mode:        { type: String, enum: ['qr', 'selfie'], default: 'qr' },
    lifelines:   { type: Number, min: 0, max: 10, default: 1 },
    lifelinesOn: { type: Boolean, default: true }, // off: no lifelines or extra hints for anyone
    maxTeamSize: { type: Number, min: 1, max: 20, default: 5 }, // most travellers allowed in one team
    teams:       { type: Boolean, default: true }, // off: everyone plays alone, nobody can join anyone
    finish: {
      place:     { type: String, trim: true, maxlength: 120, default: '' },
      placement: { type: String, trim: true, maxlength: 200, default: '' },
      message:   { type: String, trim: true, maxlength: 600, default: '' },
      code:      { type: String, required: true, uppercase: true, trim: true },
    },
    routes: { type: [routeSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HuntPreset', huntPresetSchema);
