const mongoose = require('mongoose');

// Small key/value store for app-level state (e.g. last Brevo sync result).
const appSettingSchema = new mongoose.Schema(
  {
    key:   { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppSetting', appSettingSchema);
