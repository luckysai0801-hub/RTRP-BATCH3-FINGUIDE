// routes/savedComparisons.js
const router = require('express').Router();
const { save, getMine, remove } = require('../controllers/savedComparisonController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);  // All routes require login
router.post('/', save);
router.get('/', getMine);
router.delete('/:id', remove);

module.exports = router;
