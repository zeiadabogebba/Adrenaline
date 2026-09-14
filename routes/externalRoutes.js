const express = require('express');
const router = express.Router();
const externalController = require('../controllers/externalController');

router.get('/currency', externalController.getCurrencyConversion);

module.exports = router;
