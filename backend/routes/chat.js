// routes/chat.js
const router = require('express').Router();
const { chat } = require('../controllers/chatController');
const { optionalAuth } = require('../middleware/authMiddleware');

router.post('/', optionalAuth, chat);

module.exports = router;
