const BOOKING_STATUSES = ['verifying', 'half paid', 'fully paid', 'cancelled'];

function effectiveStatus(booking) {
  if (!booking) return 'verifying';
  if (booking.status === 'cancelled') return 'cancelled';
  return booking.paymentStatus || 'verifying';
}

module.exports = { BOOKING_STATUSES, effectiveStatus };
