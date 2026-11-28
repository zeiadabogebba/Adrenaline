const express = require('express');
const router = express.Router();
const hunt = require('../controllers/treasureHuntController');
const { protect } = require('../middleware/auth');
const { uploadHuntSelfie } = require('../middleware/upload');

const selfieUpload = (req, res, next) => uploadHuntSelfie(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ status: 'fail', message: 'That photo is too large. Please use one under 12 MB.' });
  if (err.statusCode) return next(err);
  console.error('[treasure-hunt] selfie upload failed:', err.message);
  res.status(502).json({ status: 'fail', message: 'The selfie could not be uploaded. Please try again.' });
});

router.get('/:tripId/state',  protect, hunt.getState);
router.post('/:tripId/start', protect, hunt.startTeam);
router.post('/:tripId/join',  protect, hunt.joinTeam);
router.post('/:tripId/leave', protect, hunt.leaveTeam);
router.post('/:tripId/scan',  protect, hunt.scan);
router.post('/:tripId/hint',  protect, hunt.useHint);
router.post('/:tripId/selfie/:leg', protect, hunt.selfieGate, selfieUpload, hunt.submitSelfie);

module.exports = router;
