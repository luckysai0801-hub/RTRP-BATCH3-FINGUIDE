/**
 * controllers/fdController.js
 * CRUD + Maturity calculator for Fixed Deposits.
 */

const { Op } = require('sequelize');
const { FixedDeposit, Bank } = require('../models');
const { MOCK_FDS } = require('../config/mockData');
const { calcMaturity } = require('../utils/fdCalculator');

const isDb = () => !!FixedDeposit;
const BANK_ATTRS = { model: Bank, as: 'bank', attributes: ['id', 'name', 'bank_type', 'logo_url'] };

function filterMockFDs(fds, q) {
    let r = fds.filter(f => f.is_active !== false);
    if (q.min_rate) r = r.filter(f => f.interest_rate >= parseFloat(q.min_rate));
    if (q.bank_type && q.bank_type !== 'all') r = r.filter(f => f.bank_type === q.bank_type);
    if (q.min_tenure) r = r.filter(f => f.max_tenure >= parseInt(q.min_tenure));
    if (q.max_tenure) r = r.filter(f => f.min_tenure <= parseInt(q.max_tenure));
    r.sort(q.sort === 'name' ? (a, b) => a.bank_name?.localeCompare(b.bank_name) : (a, b) => b.interest_rate - a.interest_rate);
    return r.slice(0, parseInt(q.limit) || 50);
}

// GET /api/fds
const getAll = async (req, res) => {
    try {
        const { min_rate, bank_type, min_tenure, max_tenure, sort = 'rate', limit = 50 } = req.query;
        if (isDb()) {
            const where = { is_active: true };
            if (min_rate) where.interest_rate = { [Op.gte]: parseFloat(min_rate) };
            if (bank_type && bank_type !== 'all') {
                const bankWhere = { bank_type };
                const fds = await FixedDeposit.findAll({ where, include: [{ ...BANK_ATTRS, where: bankWhere }], order: [['interest_rate', 'DESC']], limit: parseInt(limit) });
                if (fds.length) return res.json({ success: true, count: fds.length, data: fds });
            } else {
                if (min_tenure) where.max_tenure = { [Op.gte]: parseInt(min_tenure) };
                if (max_tenure) where.min_tenure = { [Op.lte]: parseInt(max_tenure) };
                const sortMap = { rate: [['interest_rate', 'DESC']], name: [['scheme_name', 'ASC']] };
                const fds = await FixedDeposit.findAll({ where, include: [BANK_ATTRS], order: sortMap[sort] || [['interest_rate', 'DESC']], limit: parseInt(limit) });
                if (fds.length) return res.json({ success: true, count: fds.length, data: fds });
            }
        }
        const mock = filterMockFDs(MOCK_FDS, req.query);
        res.json({ success: true, count: mock.length, data: mock });
    } catch {
        const mock = filterMockFDs(MOCK_FDS, req.query);
        res.json({ success: true, count: mock.length, data: mock });
    }
};

// GET /api/fds/maturity?principal=&rate=&tenure=&frequency=&is_senior=
const maturityCalculator = (req, res) => {
    try {
        const { principal, rate, tenure, frequency = 'quarterly', is_senior = 'false' } = req.query;
        const p = parseFloat(principal), r = parseFloat(rate), t = parseInt(tenure);
        if (!p || !r || !t || p <= 0 || r <= 0 || t <= 0) {
            return res.status(400).json({ success: false, message: 'Valid principal, rate, and tenure required' });
        }
        const result = calcMaturity(p, r, t, frequency, is_senior === 'true');
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /api/fds/:id
const getById = async (req, res) => {
    try {
        if (isDb()) {
            const fd = await FixedDeposit.findByPk(req.params.id, { include: [BANK_ATTRS] });
            if (fd) return res.json({ success: true, data: fd });
        }
        const fd = MOCK_FDS.find(f => String(f.id) === req.params.id);
        if (!fd) return res.status(404).json({ success: false, message: 'FD not found' });
        res.json({ success: true, data: fd });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const create = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const fd = await FixedDeposit.create({ ...req.body, last_updated: new Date() });
        res.status(201).json({ success: true, data: fd });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

const update = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const fd = await FixedDeposit.findByPk(req.params.id);
        if (!fd) return res.status(404).json({ success: false, message: 'FD not found' });
        await fd.update({ ...req.body, last_updated: new Date() });
        res.json({ success: true, data: fd });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

const remove = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const fd = await FixedDeposit.findByPk(req.params.id);
        if (!fd) return res.status(404).json({ success: false, message: 'FD not found' });
        await fd.destroy();
        res.json({ success: true, message: 'FD deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, getById, maturityCalculator, create, update, remove };
