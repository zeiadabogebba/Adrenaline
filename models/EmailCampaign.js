const mongoose = require('mongoose');

// An admin-written marketing email. The editable fields live here; the
// rendered campaign lives in Brevo (brevoId).
const emailCampaignSchema = new mongoose.Schema(
  {
    brevoId:     { type: Number, default: null },
    tripId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },
    subject:     { type: String, required: [true, 'Subject is required'], trim: true, maxlength: 150 },
    previewText: { type: String, default: '', trim: true, maxlength: 200 },
    kicker:      { type: String, default: '', trim: true, maxlength: 30 },
    headline:    { type: String, default: '', trim: true, maxlength: 150 },
    message:     { type: String, default: '', maxlength: 5000 },
    details: [
      {
        _id: false,
        label: { type: String, trim: true, maxlength: 40 },
        value: { type: String, trim: true, maxlength: 120 },
      },
    ],
    imageUrl: { type: String, default: '', trim: true, maxlength: 600 },
    ctaText:  { type: String, default: '', trim: true, maxlength: 40 },
    ctaUrl:   { type: String, default: '', trim: true, maxlength: 600 },

    status:     { type: String, enum: ['draft', 'sending', 'sent'], default: 'draft' },
    testSentTo: { type: [String], default: [] },
    testSentAt: { type: Date, default: null },
    sentAt:     { type: Date, default: null },
    sentCount:  { type: Number, default: null },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmailCampaign', emailCampaignSchema);
