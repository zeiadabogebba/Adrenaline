const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');
const { uploadTravellerPhoto, uploadPaymentScreenshot } = require('../middleware/upload');

router.post('/draft',            protect, bookingController.createDraft);
router.get('/draft/:id',         protect, bookingController.getDraft);
router.put('/draft/:id',         protect, bookingController.updateDraft);
router.put('/draft/:id/promo',   protect, bookingController.applyPromoCode);
router.post('/draft/:id/traveller-photo', protect, uploadTravellerPhoto, bookingController.uploadTravellerPhoto);
router.post('/draft/:id/payment-screenshot', protect, uploadPaymentScreenshot, bookingController.uploadPaymentScreenshot);
router.put('/draft/:id/confirm', protect, bookingController.confirmBooking);
router.get('/trip-options',      protect, bookingController.getTripOptions);

router.get('/',           protect, bookingController.getMyBookings);
router.get('/:id',        protect, bookingController.getBooking);
router.put('/:id/cancel', protect, bookingController.cancelBooking);
router.post('/:id/payment-2-screenshot', protect, uploadPaymentScreenshot, bookingController.uploadSecondPaymentScreenshot);

module.exports = router;
