// routes/recommendations.js
const router = require('express').Router();
const { recommend } = require('../controllers/recommendationController');
const { optionalAuth } = require('../middleware/authMiddleware');

// Enhanced recommendations if user is logged in
router.get('/', optionalAuth, recommend);

module.exports = router;
