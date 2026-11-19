const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const bookingController = require('../controllers/bookingController');
const emails = require('../controllers/emailCampaignController');
const { protect, authorize } = require('../middleware/auth');

router.get('/stats',    protect, authorize('Admin'), adminController.getStats);
router.get('/activity', protect, authorize('Admin'), adminController.getRecentActivity);

router.get('/users', protect, authorize('Admin'), adminController.getAdminUsers);

router.get('/brevo/status', protect, authorize('Admin'), adminController.getBrevoStatus);
router.post('/brevo/sync',  protect, authorize('Admin'), adminController.runBrevoSync);

router.get('/emails',               protect, authorize('Admin'), emails.listCampaigns);
router.post('/emails',              protect, authorize('Admin'), emails.createDraft);
router.post('/emails/preview',      protect, authorize('Admin'), emails.preview);
router.get('/emails/trip/:tripId',  protect, authorize('Admin'), emails.tripDefaults);
router.get('/emails/:id',           protect, authorize('Admin'), emails.getCampaign);
router.put('/emails/:id',           protect, authorize('Admin'), emails.updateDraft);
router.delete('/emails/:id',        protect, authorize('Admin'), emails.deleteDraft);
router.post('/emails/:id/test',     protect, authorize('Admin'), emails.sendTest);
router.post('/emails/:id/send',     protect, authorize('Admin'), emails.sendToAll);

router.get('/bookings',          protect, authorize('Admin'), bookingController.getAllBookings);
router.get('/bookings/export',   protect, authorize('Admin'), bookingController.exportTripBookingsCsv);
router.patch('/bookings/:id/status', protect, authorize('Admin'), bookingController.updateBookingStatus);

module.exports = router;
