const mongoose = require('mongoose');

// One document holds the payment accounts customers send money to. Admins edit it
// from the Trip Management page; a disabled method disappears from the booking flow.
const methodSchema = {
  enabled: { type: Boolean, default: false },
  number:  { type: String, default: '', trim: true, maxlength: [60, 'Payment number cannot exceed 60 characters'] },
};

const paymentSettingsSchema = new mongoose.Schema(
  {
    key:          { type: String, default: 'payment', unique: true },
    instapay:     methodSchema,
    vodafoneCash: methodSchema,
  },
  { timestamps: true }
);

// The values the site shipped with, used until an admin saves their own.
const DEFAULTS = {
  instapay:     { enabled: false, number: '' },
  vodafoneCash: { enabled: true,  number: '01553905110' },
};

paymentSettingsSchema.statics.get = async function () {
  const existing = await this.findOne({ key: 'payment' });
  if (existing) return existing;
  try {
    return await this.create({ key: 'payment', ...DEFAULTS });
  } catch (err) {
    if (err.code === 11000) return this.findOne({ key: 'payment' }); // created by a parallel request
    throw err;
  }
};

// Methods a customer can pay with right now, in display order, keyed by the
// value stored on Booking.paymentMethod.
paymentSettingsSchema.methods.availableMethods = function () {
  return [
    { id: 'instapay',      enabled: this.instapay.enabled,     number: this.instapay.number },
    { id: 'vodafone-cash', enabled: this.vodafoneCash.enabled, number: this.vodafoneCash.number },
  ].filter((m) => m.enabled && m.number);
};

module.exports = mongoose.model('PaymentSettings', paymentSettingsSchema);
