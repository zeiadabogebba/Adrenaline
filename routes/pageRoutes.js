const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');
const googleSheets = require('../controllers/googleSheetsController');
const photoBook = require('../controllers/photoBookController');
const { protect, optionalAuth, authorize } = require('../middleware/auth');

router.get('/',               optionalAuth, pageController.getLandingPage);
router.get('/login',          optionalAuth, pageController.getLoginPage);
router.get('/register',       optionalAuth, pageController.getRegisterPage);
router.get('/packages/day',   optionalAuth, pageController.getDayPackages);
router.get('/packages/week',  optionalAuth, pageController.getWeekPackages);
router.get('/packages/single',optionalAuth, pageController.getSinglePackages);
router.get('/trips/upcoming',  optionalAuth, pageController.getUpcomingTrips);
router.get('/trips/past',      optionalAuth, pageController.getPastTrips);
router.get('/trips/:id',       optionalAuth, pageController.getTripDetails);
router.get('/contact',        optionalAuth, pageController.getContactPage);
router.get('/about',          optionalAuth, pageController.getAboutPage);
router.get('/faq',            optionalAuth, pageController.getFaqPage);
router.get('/privacy',        optionalAuth, pageController.getPrivacyPage);
router.get('/terms',          optionalAuth, pageController.getTermsPage);
router.get('/city-guides/:slug', optionalAuth, pageController.getCityGuidePage);

router.get('/dashboard',          protect, pageController.getDashboard);
router.get('/profile',            protect, pageController.getProfilePage);
router.get('/my-bookings',        protect, pageController.getMyBookingsPage);
router.get('/booking/summary',    protect, pageController.getBookingSummaryPage);
router.get('/booking/travellers', protect, pageController.getTravellersPage);
router.get('/booking/:id',        protect, pageController.getBookingDetailsPage);
router.get('/reviews/write',      protect, pageController.getWriteReviewPage);
router.get('/photo-book',         protect, photoBook.getPhotoBooksPage);
router.get('/photo-book/:tripId', protect, photoBook.getPhotoBookPage);
router.get('/custom-trip',        protect, pageController.getCustomTripPage);

router.get('/admin',          protect, authorize('Admin'), pageController.getAdminDashboard);
router.get('/admin/bookings', protect, authorize('Admin'), pageController.getAdminBookingsPage);
router.get('/admin/google-sheets/connect',  protect, authorize('Admin'), googleSheets.connect);
router.get('/admin/google-sheets/callback', protect, authorize('Admin'), googleSheets.callback);
router.get('/admin/packages', protect, authorize('Admin'), pageController.getAdminPackagesPage);
router.get('/admin/trips',    protect, authorize('Admin'), pageController.getAdminTripsPage);
router.get('/admin/photo-books', protect, authorize('Admin'), photoBook.getAdminPhotoBooksPage);
router.get('/admin/trip-requests', protect, authorize('Admin'), pageController.getAdminTripRequestsPage);
router.get('/admin/contact',  protect, authorize('Admin'), pageController.getAdminContactPage);
router.get('/admin/users',    protect, authorize('Admin'), pageController.getAdminUsersPage);
router.get('/admin/reports',  protect, authorize('Admin'), pageController.getAdminReportsPage);
router.get('/admin/emails',   protect, authorize('Admin'), pageController.getAdminEmailsPage);

module.exports = router;
