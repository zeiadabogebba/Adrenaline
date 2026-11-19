const getCurrencyConversion = async (req, res) => {
  try {
    const amount = parseFloat(req.query.amount);
    const from = req.query.from || 'EGP';
    if (!amount || isNaN(amount)) {
      return res.status(400).json({ status: 'fail', message: 'Valid amount is required' });
    }

    const response = await fetch(`https://open.exchangerate-api.com/v6/latest/${from}`);
    const data = await response.json();
    if (!response.ok || data.result !== 'success') {
      return res.status(502).json({ status: 'fail', message: 'Currency data unavailable' });
    }

    const rates = data.rates;
    res.json({
      status: 'success',
      data: {
        from,
        amount,
        USD: Math.round(amount * rates.USD),
        EUR: Math.round(amount * rates.EUR),
        GBP: Math.round(amount * rates.GBP),
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'fail', message: 'Currency service error' });
  }
};

const brevo = require('../utils/brevo');

// Brevo marketing webhook (unsubscribe / spam / hard bounce). The payload is
// not trusted: each email is re-checked against Brevo's API before the user's
// setting is changed, so a forged call can't opt anyone out.
const brevoWebhook = (req, res) => {
  res.status(200).json({ status: 'success' });
  if (!brevo.isEnabled()) return;
  const events = (Array.isArray(req.body) ? req.body : [req.body]).slice(0, 50);
  const emails = [...new Set(events
    .map((e) => (e && typeof e.email === 'string' ? e.email.trim().toLowerCase() : ''))
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
  emails.forEach((email) => {
    brevo.applyBrevoUnsubscribe(email)
      .then((changed) => { if (changed) console.log('[brevo] webhook: opted a user out'); })
      .catch((err) => console.error('[brevo] webhook check failed:', err.message));
  });
};

module.exports = { getCurrencyConversion, brevoWebhook };
