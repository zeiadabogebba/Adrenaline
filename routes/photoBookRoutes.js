const express = require('express');
const router = express.Router();
const photoBook = require('../controllers/photoBookController');
const { protect } = require('../middleware/auth');
const { uploadPhotoBookPhoto } = require('../middleware/upload');
const AppError = require('../utils/AppError');

// Turns upload failures (too big, wrong type) into a clear 400 instead of a server error.
const uploadPhoto = (req, res, next) => uploadPhotoBookPhoto(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('That photo is too large. Please choose one under 8 MB.', 400));
  if (err instanceof AppError) return next(err);
  console.error('[photo-book] upload failed:', err.message);
  next(new AppError('The photo could not be uploaded. Please try another one.', 400));
});

router.post('/:tripId/pages',           protect, photoBook.checkCanAddPage, uploadPhoto, photoBook.addPage);
router.delete('/:tripId/pages/:pageId', protect, photoBook.deletePage);

module.exports = router;
