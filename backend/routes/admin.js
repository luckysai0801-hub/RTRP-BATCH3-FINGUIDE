// routes/admin.js
const router = require('express').Router();
const { getDashboard, updateRates } = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

router.use(protect, adminOnly);  // All admin routes require admin role
router.get('/dashboard', getDashboard);
router.post('/update-rates', updateRates);

module.exports = router;
