const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { protect, optionalAuth, authorize } = require('../middleware/auth');

const { validateContact } = require('../middleware/validate');

router.post('/', optionalAuth, validateContact, contactController.createTicket);
router.get('/my-tickets', protect, contactController.getMyTickets);
router.get('/', protect, authorize('Admin'), contactController.getAllTickets);
router.patch('/:id/status', protect, authorize('Admin'), contactController.updateTicketStatus);
router.post('/:id/reply',   protect, authorize('Admin'), contactController.replyToTicket);

module.exports = router;
