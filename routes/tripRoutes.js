const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { protect, authorize } = require('../middleware/auth');
const { uploadTripImage } = require('../middleware/upload');

router.get('/',    tripController.getAllTrips);
router.post('/gallery-photo', protect, authorize('Admin'), uploadTripImage, tripController.uploadGalleryPhoto);
router.get('/:id', tripController.getTrip);

router.post('/',          protect, authorize('Admin'),                  tripController.createTrip);
router.put('/:id',        protect, authorize('Admin'),                  tripController.updateTrip);
router.delete('/:id',     protect, authorize('Admin'),                  tripController.deleteTrip);
router.post('/:id/image', protect, authorize('Admin'), uploadTripImage, tripController.uploadTripImage);

module.exports = router;
