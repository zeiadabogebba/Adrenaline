const express = require('express');
const router = express.Router();
const externalController = require('../controllers/externalController');

router.get('/currency', externalController.getCurrencyConversion);
router.post('/brevo-webhook', externalController.brevoWebhook);

module.exports = router;
