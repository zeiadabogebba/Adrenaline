const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const bookingController = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');

router.get('/stats',    protect, authorize('Admin'), adminController.getStats);
router.get('/activity', protect, authorize('Admin'), adminController.getRecentActivity);

router.get('/users', protect, authorize('Admin'), adminController.getAdminUsers);

router.get('/bookings',          protect, authorize('Admin'), bookingController.getAllBookings);
router.patch('/bookings/:id/status', protect, authorize('Admin'), bookingController.updateBookingStatus);

module.exports = router;
