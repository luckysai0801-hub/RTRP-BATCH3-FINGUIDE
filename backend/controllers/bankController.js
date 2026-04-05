/**
 * controllers/bankController.js
 * Public read + admin CRUD for Banks.
 */

const { Bank, CreditCard, Loan, FixedDeposit } = require('../models');
const { MOCK_BANKS } = require('../config/mockData');

const isDb = () => !!Bank;

// GET /api/banks
const getAll = async (req, res) => {
    try {
        if (isDb()) {
            const banks = await Bank.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
            if (banks.length) return res.json({ success: true, count: banks.length, data: banks });
        }
        res.json({ success: true, count: MOCK_BANKS.length, data: MOCK_BANKS });
    } catch {
        res.json({ success: true, count: MOCK_BANKS.length, data: MOCK_BANKS });
    }
};

// GET /api/banks/:id  (with all products)
const getById = async (req, res) => {
    try {
        if (isDb()) {
            const bank = await Bank.findByPk(req.params.id, {
                include: [
                    { model: CreditCard, as: 'creditCards', where: { is_active: true }, required: false, limit: 10 },
                    { model: Loan, as: 'loans', where: { is_active: true }, required: false, limit: 10 },
                    { model: FixedDeposit, as: 'fixedDeposits', where: { is_active: true }, required: false, limit: 5 },
                ],
            });
            if (bank) return res.json({ success: true, data: bank });
        }
        const bank = MOCK_BANKS.find(b => String(b.id) === req.params.id);
        if (!bank) return res.status(404).json({ success: false, message: 'Bank not found' });
        res.json({ success: true, data: bank });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const create = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const bank = await Bank.create(req.body);
        res.status(201).json({ success: true, data: bank });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

const update = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const bank = await Bank.findByPk(req.params.id);
        if (!bank) return res.status(404).json({ success: false, message: 'Bank not found' });
        await bank.update(req.body);
        res.json({ success: true, data: bank });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

const remove = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const bank = await Bank.findByPk(req.params.id);
        if (!bank) return res.status(404).json({ success: false, message: 'Bank not found' });
        await bank.destroy();
        res.json({ success: true, message: 'Bank and all its products deleted (CASCADE)' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, getById, create, update, remove };
