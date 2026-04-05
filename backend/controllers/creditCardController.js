/**
 * controllers/creditCardController.js
 * CRUD + filter for CreditCards.
 * Falls back to MOCK_CREDIT_CARDS when DB not connected.
 */

const { Op } = require('sequelize');
const { CreditCard, Bank } = require('../models');
const { MOCK_CREDIT_CARDS } = require('../config/mockData');

const isDb = () => !!CreditCard;

const BANK_ATTRS = { model: Bank, as: 'bank', attributes: ['id', 'name', 'bank_type', 'logo_url', 'website'] };

// Apply filters to mock data array
function filterMock(cards, q) {
    let r = cards.filter(c => c.is_active !== false);
    if (q.rewards_type && q.rewards_type !== 'all') r = r.filter(c => c.rewards_type === q.rewards_type);
    if (q.min_cashback) r = r.filter(c => (c.cashback || 0) >= parseFloat(q.min_cashback));
    if (q.max_fee !== undefined && q.max_fee !== '') r = r.filter(c => c.annual_fee <= parseFloat(q.max_fee));
    if (q.min_fee !== undefined && q.min_fee !== '') r = r.filter(c => c.annual_fee >= parseFloat(q.min_fee));
    if (q.network) r = r.filter(c => c.network === q.network);
    if (q.lounge_access === 'true') r = r.filter(c => c.lounge_access);
    if (q.search) {
        const s = q.search.toLowerCase();
        r = r.filter(c => c.card_name?.toLowerCase().includes(s) || c.bank_name?.toLowerCase().includes(s));
    }
    const sortFn = { rating: (a, b) => b.rating - a.rating, cashback: (a, b) => b.cashback - a.cashback, fee: (a, b) => a.annual_fee - b.annual_fee, rate: (a, b) => a.interest_rate - b.interest_rate };
    r.sort(sortFn[q.sort] || sortFn.rating);
    return r.slice(0, parseInt(q.limit) || 60);
}

// GET /api/credit-cards
const getAll = async (req, res) => {
    try {
        const { rewards_type, min_cashback, max_fee, min_fee, sort = 'rating', limit = 60, network, lounge_access, search } = req.query;
        if (isDb()) {
            const where = { is_active: true };
            if (rewards_type && rewards_type !== 'all') where.rewards_type = rewards_type;
            if (min_cashback) where.cashback = { [Op.gte]: parseFloat(min_cashback) };
            if (max_fee !== undefined && max_fee !== '') where.annual_fee = { ...(where.annual_fee || {}), [Op.lte]: parseFloat(max_fee) };
            if (min_fee !== undefined && min_fee !== '') where.annual_fee = { ...(where.annual_fee || {}), [Op.gte]: parseFloat(min_fee) };
            if (network) where.network = network;
            if (lounge_access === 'true') where.lounge_access = true;
            if (search) where[Op.or] = [{ card_name: { [Op.iLike]: `%${search}%` } }];
            const sortMap = { rating: [['rating', 'DESC']], cashback: [['cashback', 'DESC']], fee: [['annual_fee', 'ASC']], rate: [['interest_rate', 'ASC']] };
            const cards = await CreditCard.findAll({ where, include: [BANK_ATTRS], order: sortMap[sort] || [['rating', 'DESC']], limit: parseInt(limit) });
            if (cards.length) return res.json({ success: true, count: cards.length, data: cards });
        }
        const mock = filterMock(MOCK_CREDIT_CARDS, req.query);
        res.json({ success: true, count: mock.length, data: mock });
    } catch (err) {
        const mock = filterMock(MOCK_CREDIT_CARDS, req.query);
        res.json({ success: true, count: mock.length, data: mock });
    }
};

// GET /api/credit-cards/:id
const getById = async (req, res) => {
    try {
        if (isDb()) {
            const card = await CreditCard.findByPk(req.params.id, { include: [BANK_ATTRS] });
            if (card) return res.json({ success: true, data: card });
        }
        const card = MOCK_CREDIT_CARDS.find(c => String(c.id) === req.params.id || c._id === req.params.id);
        if (!card) return res.status(404).json({ success: false, message: 'Card not found' });
        res.json({ success: true, data: card });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/credit-cards (admin)
const create = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required for admin operations' });
        const card = await CreditCard.create({ ...req.body, last_updated: new Date() });
        res.status(201).json({ success: true, data: card });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// PUT /api/credit-cards/:id (admin)
const update = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required for admin operations' });
        const card = await CreditCard.findByPk(req.params.id);
        if (!card) return res.status(404).json({ success: false, message: 'Card not found' });
        await card.update({ ...req.body, last_updated: new Date() });
        res.json({ success: true, data: card });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// DELETE /api/credit-cards/:id (admin)
const remove = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required for admin operations' });
        const card = await CreditCard.findByPk(req.params.id);
        if (!card) return res.status(404).json({ success: false, message: 'Card not found' });
        await card.destroy();
        res.json({ success: true, message: 'Credit card deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { getAll, getById, create, update, remove };
