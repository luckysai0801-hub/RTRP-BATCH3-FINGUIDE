// routes/loans.js
const router = require('express').Router();
const { getAll, getById, emiCalculator, create, update, remove } = require('../controllers/loanController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// Calculator before :id to avoid route conflict
router.get('/emi', emiCalculator);
router.get('/', getAll);
router.get('/:id', getById);
router.post('/', protect, adminOnly, create);
router.put('/:id', protect, adminOnly, update);
router.delete('/:id', protect, adminOnly, remove);

module.exports = router;
