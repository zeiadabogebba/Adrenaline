const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validateRegister, validateLogin, validatePasswordUpdate } = require('../middleware/validate');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { status: 'fail', message: 'Too many login attempts. Please try again after 15 minutes.' },
});

router.post('/register',        authLimiter, validateRegister,       authController.register);
router.post('/verify-otp',      authLimiter,                         authController.verifyOtp);
router.post('/resend-otp',      authLimiter,                         authController.resendOtp);
router.post('/login',           authLimiter, validateLogin,          authController.login);
router.post('/google',          authLimiter,                         authController.googleAuth);
router.post('/logout',          authController.logout);
router.get('/me',               protect,                             authController.getMe);
router.put('/update-password',  protect,     validatePasswordUpdate, authController.updatePassword);

module.exports = router;
