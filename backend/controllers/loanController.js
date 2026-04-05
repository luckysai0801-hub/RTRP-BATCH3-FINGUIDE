/**
 * controllers/loanController.js
 * CRUD + EMI calculator for Loans.
 * Falls back to MOCK_LOANS when DB not connected.
 */

const { Op } = require('sequelize');
const { Loan, Bank } = require('../models');
const { MOCK_LOANS } = require('../config/mockData');
const { calcLoanSummary } = require('../utils/emiCalculator');

const isDb = () => !!Loan;
const BANK_ATTRS = { model: Bank, as: 'bank', attributes: ['id', 'name', 'bank_type', 'logo_url'] };

function filterMockLoans(loans, q) {
    let r = loans.filter(l => l.is_active !== false);
    if (q.loan_type && q.loan_type !== 'all') r = r.filter(l => l.loan_type === q.loan_type);
    if (q.max_rate) r = r.filter(l => l.interest_rate <= parseFloat(q.max_rate));
    const sortFn = { rating: (a, b) => b.rating - a.rating, rate: (a, b) => a.interest_rate - b.interest_rate, fee: (a, b) => a.processing_fee - b.processing_fee };
    r.sort(sortFn[q.sort] || sortFn.rating);
    return r.slice(0, parseInt(q.limit) || 50);
}

// GET /api/loans
const getAll = async (req, res) => {
    try {
        const { loan_type, max_rate, sort = 'rating', limit = 50 } = req.query;
        if (isDb()) {
            const where = { is_active: true };
            if (loan_type && loan_type !== 'all') where.loan_type = loan_type;
            if (max_rate) where.interest_rate = { [Op.lte]: parseFloat(max_rate) };
            const sortMap = { rating: [['rating', 'DESC']], rate: [['interest_rate', 'ASC']], fee: [['processing_fee', 'ASC']] };
            const loans = await Loan.findAll({ where, include: [BANK_ATTRS], order: sortMap[sort] || [['rating', 'DESC']], limit: parseInt(limit) });
            if (loans.length) return res.json({ success: true, count: loans.length, data: loans });
        }
        const mock = filterMockLoans(MOCK_LOANS, req.query);
        res.json({ success: true, count: mock.length, data: mock });
    } catch {
        const mock = filterMockLoans(MOCK_LOANS, req.query);
        res.json({ success: true, count: mock.length, data: mock });
    }
};

// GET /api/loans/emi?principal=&rate=&tenure=
const emiCalculator = (req, res) => {
    try {
        const { principal, rate, tenure } = req.query;
        const p = parseFloat(principal), r = parseFloat(rate), n = parseInt(tenure);
        if (!p || !r || !n || p <= 0 || r <= 0 || n <= 0) {
            return res.status(400).json({ success: false, message: 'Valid principal, rate, and tenure required' });
        }
        res.json({ success: true, data: calcLoanSummary(p, r, n) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/loans/:id
const getById = async (req, res) => {
    try {
        if (isDb()) {
            const loan = await Loan.findByPk(req.params.id, { include: [BANK_ATTRS] });
            if (loan) return res.json({ success: true, data: loan });
        }
        const loan = MOCK_LOANS.find(l => String(l.id) === req.params.id);
        if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
        res.json({ success: true, data: loan });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/loans (admin)
const create = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const loan = await Loan.create({ ...req.body, last_updated: new Date() });
        res.status(201).json({ success: true, data: loan });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

// PUT /api/loans/:id (admin)
const update = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const loan = await Loan.findByPk(req.params.id);
        if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
        await loan.update({ ...req.body, last_updated: new Date() });
        res.json({ success: true, data: loan });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

// DELETE /api/loans/:id (admin)
const remove = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const loan = await Loan.findByPk(req.params.id);
        if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
        await loan.destroy();
        res.json({ success: true, message: 'Loan deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, getById, emiCalculator, create, update, remove };
