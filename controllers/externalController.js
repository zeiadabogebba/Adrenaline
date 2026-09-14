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

module.exports = { getCurrencyConversion };
