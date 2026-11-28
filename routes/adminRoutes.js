const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const bookingController = require('../controllers/bookingController');
const emails = require('../controllers/emailCampaignController');
const emailTemplates = require('../controllers/emailTemplateController');
const googleSheets = require('../controllers/googleSheetsController');
const photoBook = require('../controllers/photoBookController');
const hunt = require('../controllers/treasureHuntController');
const { uploadHuntPhoto } = require('../middleware/upload');
const AppError = require('../utils/AppError');
const { protect, authorize } = require('../middleware/auth');

router.get('/stats',    protect, authorize('Admin'), adminController.getStats);
router.get('/activity', protect, authorize('Admin'), adminController.getRecentActivity);

router.get('/users', protect, authorize('Admin'), adminController.getAdminUsers);

router.get('/brevo/status', protect, authorize('Admin'), adminController.getBrevoStatus);
router.post('/brevo/sync',  protect, authorize('Admin'), adminController.runBrevoSync);

router.get('/email-templates',                protect, authorize('Admin'), emailTemplates.list);
router.post('/email-templates/otp/test',      protect, authorize('Admin'), emailTemplates.testOtp);
router.post('/email-templates/:key/preview',  protect, authorize('Admin'), emailTemplates.preview);
router.put('/email-templates/:key',          protect, authorize('Admin'), emailTemplates.update);
router.delete('/email-templates/:key',       protect, authorize('Admin'), emailTemplates.reset);

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

router.get('/google-sheets/status',          protect, authorize('Admin'), googleSheets.status);
router.post('/google-sheets/sync',           protect, authorize('Admin'), googleSheets.syncAll);
router.post('/google-sheets/trip/:tripId',   protect, authorize('Admin'), googleSheets.syncTrip);
router.patch('/photo-books/:tripId',         protect, authorize('Admin'), photoBook.updateTripSetting);

// Treasure hunt
const huntPhoto = (req, res, next) => uploadHuntPhoto(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('That photo is too large. Please choose one under 8 MB.', 400));
  if (err instanceof AppError) return next(err);
  console.error('[treasure-hunt] upload failed:', err.message);
  next(new AppError('The photo could not be uploaded. Please try another one.', 400));
});
router.post('/treasure-hunt/presets',                    protect, authorize('Admin'), hunt.createPreset);
router.put('/treasure-hunt/presets/:id',                 protect, authorize('Admin'), hunt.updatePreset);
router.post('/treasure-hunt/presets/:id/duplicate',      protect, authorize('Admin'), hunt.duplicatePreset);
router.delete('/treasure-hunt/presets/:id',              protect, authorize('Admin'), hunt.deletePreset);
router.post('/treasure-hunt/photo',                      protect, authorize('Admin'), huntPhoto, hunt.uploadPhoto);
router.patch('/treasure-hunt/trips/:tripId',             protect, authorize('Admin'), hunt.updateTripSetting);
router.patch('/treasure-hunt/trips/:tripId/teams/:teamId/selfies/:leg', protect, authorize('Admin'), hunt.reviewSelfie);
router.delete('/treasure-hunt/trips/:tripId/teams',      protect, authorize('Admin'), hunt.resetTeams);
router.delete('/treasure-hunt/trips/:tripId/teams/:teamId', protect, authorize('Admin'), hunt.resetTeams);
router.delete('/google-sheets',              protect, authorize('Admin'), googleSheets.disconnect);

module.exports = router;
