// Methods a customer can pay a trip with, in display order, keyed by the value
// stored on Booking.paymentMethod. A method with no number set isn't offered.
function tripPaymentMethods(trip) {
  if (!trip) return [];
  return [
    { id: 'instapay',      number: trip.instapayNumber },
    { id: 'vodafone-cash', number: trip.vodafoneCashNumber },
  ].filter((m) => m.number);
}

module.exports = { tripPaymentMethods };
