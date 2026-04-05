// routes/fds.js
const router = require('express').Router();
const { getAll, getById, maturityCalculator, create, update, remove } = require('../controllers/fdController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

router.get('/maturity', maturityCalculator);
router.get('/', getAll);
router.get('/:id', getById);
router.post('/', protect, adminOnly, create);
router.put('/:id', protect, adminOnly, update);
router.delete('/:id', protect, adminOnly, remove);

module.exports = router;
