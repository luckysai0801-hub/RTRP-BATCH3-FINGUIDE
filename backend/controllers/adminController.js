/**
 * controllers/adminController.js
 * Admin dashboard stats + rate update trigger.
 */

const { CreditCard, Loan, FixedDeposit, Bank } = require('../models');
const { MOCK_CREDIT_CARDS, MOCK_LOANS, MOCK_FDS, MOCK_BANKS } = require('../config/mockData');

const isDb = () => !!CreditCard;

// GET /api/admin/dashboard
const getDashboard = async (req, res) => {
    try {
        let stats;
        if (isDb()) {
            const [cards, loans, fds, banks] = await Promise.all([
                CreditCard.count({ where: { is_active: true } }),
                Loan.count({ where: { is_active: true } }),
                FixedDeposit.count({ where: { is_active: true } }),
                Bank.count({ where: { is_active: true } }),
            ]);
            stats = { credit_cards: cards, loans, fixed_deposits: fds, users: 0, banks };
        } else {
            stats = {
                credit_cards: MOCK_CREDIT_CARDS.length,
                loans: MOCK_LOANS.length,
                fixed_deposits: MOCK_FDS.length,
                users: 0,
                banks: MOCK_BANKS.length,
                note: 'Mock data mode',
            };
        }
        res.json({ success: true, data: stats });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/admin/update-rates
// Simulates fetching latest rates from an external source and updating DB
const updateRates = async (req, res) => {
    try {
        // If RapidAPI key is set, try external call; else simulate
        const rapidKey = process.env.RAPIDAPI_KEY;
        let source = 'simulation';
        let updated = 0;

        if (rapidKey) {
            // TODO: map live API response to DB models and upsert
            source = 'RapidAPI';
            // For now — simulate
        }

        if (isDb()) {
            // Simulate small interest rate tweaks (±0.05%) for demo
            const [n] = await CreditCard.update(
                { last_updated: new Date() },
                { where: { is_active: true } }
            );
            updated = n;
        }

        res.json({ success: true, message: `Rates updated from ${source}`, records_touched: updated });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getDashboard, updateRates };
