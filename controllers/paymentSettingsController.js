const PaymentSettings = require('../models/PaymentSettings');
const AppError = require('../utils/AppError');

const METHODS = { instapay: 'InstaPay', vodafoneCash: 'Vodafone Cash' };

const getPaymentSettings = async (req, res, next) => {
  try {
    const settings = await PaymentSettings.get();
    res.status(200).json({ status: 'success', data: { settings } });
  } catch (err) {
    next(err);
  }
};

const updatePaymentSettings = async (req, res, next) => {
  try {
    const settings = await PaymentSettings.get();

    for (const [key, label] of Object.entries(METHODS)) {
      const input = req.body[key];
      if (!input || typeof input !== 'object') continue;

      const enabled = Boolean(input.enabled);
      const number = String(input.number || '').trim();
      if (number.length > 60) {
        return next(new AppError(`The ${label} number is too long.`, 400));
      }
      if (enabled && !number) {
        return next(new AppError(`Enter a ${label} number before enabling it.`, 400));
      }
      settings[key].enabled = enabled;
      settings[key].number = number;
    }

    await settings.save();
    res.status(200).json({ status: 'success', message: 'Payment settings saved.', data: { settings } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPaymentSettings, updatePaymentSettings };
