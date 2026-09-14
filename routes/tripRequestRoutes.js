const express = require('express');
const router = express.Router();
const tripRequestController = require('../controllers/tripRequestController');
const { protect, authorize } = require('../middleware/auth');
const { uploadTravellerPhoto } = require('../middleware/upload');

router.post('/', protect, tripRequestController.createRequest);
router.post('/traveller-photo', protect, uploadTravellerPhoto, tripRequestController.uploadTravellerPhoto);
router.put('/:id/cancel', protect, tripRequestController.cancelRequest);

router.get('/', protect, authorize('Admin'), tripRequestController.getAllRequests);
router.patch('/:id/status', protect, authorize('Admin'), tripRequestController.updateRequestStatus);

module.exports = router;
