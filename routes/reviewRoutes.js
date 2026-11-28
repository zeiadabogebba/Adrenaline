const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/auth');

const { validateReview } = require('../middleware/validate');
const { uploadReviewPhotos } = require('../middleware/upload');

router.post('/', protect, validateReview, reviewController.createReview);
router.post('/:id/photos', protect, uploadReviewPhotos, reviewController.uploadReviewPhotos);
router.get('/mine', protect, reviewController.getMyReviews);
router.get('/prompt', protect, reviewController.getReviewPrompt);
router.post('/prompt/:tripId/dismiss', protect, reviewController.dismissReviewPrompt);
router.get('/package/:packageId', reviewController.getPackageReviews);
router.get('/', protect, authorize('Admin'), reviewController.getAllReviews);
router.patch('/:id/visibility', protect, authorize('Admin'), reviewController.setReviewVisibility);
router.delete('/:id', protect, reviewController.deleteReview);

module.exports = router;
