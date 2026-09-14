const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const bookingController = require('../controllers/bookingController');
const paymentSettingsController = require('../controllers/paymentSettingsController');
const { protect, authorize } = require('../middleware/auth');

router.get('/stats',    protect, authorize('Admin'), adminController.getStats);
router.get('/activity', protect, authorize('Admin'), adminController.getRecentActivity);

router.get('/users', protect, authorize('Admin'), adminController.getAdminUsers);

router.get('/bookings',          protect, authorize('Admin'), bookingController.getAllBookings);
router.patch('/bookings/:id/status', protect, authorize('Admin'), bookingController.updateBookingStatus);

router.get('/payment-settings', protect, authorize('Admin'), paymentSettingsController.getPaymentSettings);
router.put('/payment-settings', protect, authorize('Admin'), paymentSettingsController.updatePaymentSettings);

module.exports = router;
