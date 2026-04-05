/**
 * controllers/savedComparisonController.js
 * Allows authenticated users to save and retrieve product comparisons.
 * FK: user_id → Users (ON DELETE CASCADE)
 */

const { SavedComparison } = require('../models');

const isDb = () => !!SavedComparison;

// POST /api/saved-comparisons
const save = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required for saved comparisons' });
        const { product_type, product_ids, label, notes } = req.body;
        if (!product_ids || product_ids.length < 2 || product_ids.length > 3) {
            return res.status(400).json({ success: false, message: 'Product ids must be an array of 2 or 3 items' });
        }
        const comparison = await SavedComparison.create({
            user_id: req.user.id, product_type, product_ids, label, notes,
        });
        res.status(201).json({ success: true, data: comparison });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

// GET /api/saved-comparisons
const getMine = async (req, res) => {
    try {
        if (!isDb()) return res.json({ success: true, data: [], note: 'Database not connected' });
        const comparisons = await SavedComparison.findAll({
            where: { user_id: req.user.id },
            order: [['created_at', 'DESC']],
        });
        res.json({ success: true, count: comparisons.length, data: comparisons });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// DELETE /api/saved-comparisons/:id
const remove = async (req, res) => {
    try {
        if (!isDb()) return res.status(503).json({ success: false, message: 'Database required' });
        const comp = await SavedComparison.findOne({ where: { id: req.params.id, user_id: req.user.id } });
        if (!comp) return res.status(404).json({ success: false, message: 'Comparison not found' });
        await comp.destroy();
        res.json({ success: true, message: 'Saved comparison deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { save, getMine, remove };
