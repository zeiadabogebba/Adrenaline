const express = require('express');
const router = express.Router();
const avatarController = require('../controllers/avatarController');

router.get('/initials.svg', avatarController.initialsAvatar);

module.exports = router;
