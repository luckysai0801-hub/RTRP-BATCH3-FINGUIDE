/**
 * routes/cards.js
 * Multi-source card aggregator routes.
 *
 *   GET  /api/cards               → paginated, filtered card listing
 *   POST /api/cards/sync          → trigger background scrape (admin only)
 *   GET  /api/cards/sync/status   → last N scraper run logs
 */

'use strict';

const router  = require('express').Router();
const { getCards, syncCards, getSyncStatus } = require('../controllers/cardsController');
const { protect }   = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// Public endpoints
router.get('/',             getCards);
router.get('/sync/status',  getSyncStatus);

// Admin-protected endpoints
router.post('/sync', protect, adminOnly, syncCards);

module.exports = router;
