// Bookings made before deposits were configurable per trip were all 50%.
const DEFAULT_DEPOSIT_PERCENT = 50;

function depositPercentOf(booking) {
  return (booking && booking.depositPercent) || DEFAULT_DEPOSIT_PERCENT;
}

function depositAmount(booking) {
  return Math.round(((booking && booking.totalPrice) || 0) * depositPercentOf(booking) / 100);
}

module.exports = { DEFAULT_DEPOSIT_PERCENT, depositPercentOf, depositAmount };
