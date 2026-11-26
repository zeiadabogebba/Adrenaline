const express = require('express');
const router = express.Router();
const hunt = require('../controllers/treasureHuntController');
const { protect } = require('../middleware/auth');

router.get('/:tripId/state',  protect, hunt.getState);
router.post('/:tripId/start', protect, hunt.startTeam);
router.post('/:tripId/join',  protect, hunt.joinTeam);
router.post('/:tripId/leave', protect, hunt.leaveTeam);
router.post('/:tripId/scan',  protect, hunt.scan);
router.post('/:tripId/hint',  protect, hunt.useHint);

module.exports = router;
