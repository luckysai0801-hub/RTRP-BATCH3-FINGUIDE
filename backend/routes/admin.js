// routes/admin.js
const router = require('express').Router();
const { getDashboard, updateRates } = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

const { runAllScrapers } = require('../scraper/scheduler');
const { ScraperLog, CreditCard, Loan, FixedDeposit, Bank } = require('../models');

// Fetch public stats for homepage
router.get('/public-stats', async (req, res) => {
    try {
        const [cards, loans, fds, banks] = await Promise.all([
            CreditCard ? CreditCard.count() : 0,
            Loan ? Loan.count() : 0,
            FixedDeposit ? FixedDeposit.count() : 0,
            Bank ? Bank.count() : 0,
        ]);
        res.json({ success: true, data: { cards, loans, fds, banks } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Simple in-memory visitor counter
let globalVisitorCount = 8402;
router.post('/visit', (req, res) => {
    globalVisitorCount += 1; // Increment by exactly 1
    res.json({ success: true, count: globalVisitorCount });
});

// ⚠️  UNPROTECTED — for quick browser testing only.
// Move this block BELOW router.use(protect, adminOnly) before deploying to production.
router.get('/run-update', async (req, res) => {
    try {
        const result = await runAllScrapers();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Fetch last 50 scraper run logs — used by Scraper Center tab in admin dashboard
router.get('/scraper-logs', async (req, res) => {
    try {
        if (!ScraperLog) return res.json({ success: true, data: [] });
        const logs = await ScraperLog.findAll({
            order: [['run_at', 'DESC']],
            limit: 50,
        });
        res.json({ success: true, data: logs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// All routes below require a valid admin JWT token
router.use(protect, adminOnly);
router.get('/dashboard', getDashboard);
router.post('/update-rates', updateRates);

router.post('/reset-visitors', (req, res) => {
    globalVisitorCount = 0;
    res.json({ success: true, message: 'Visitor counter reset to 0', count: 0 });
});

module.exports = router;
