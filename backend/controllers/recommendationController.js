/**
 * controllers/recommendationController.js
 * GET /api/recommendations
 * Accepts query params: monthly_salary, spending_profile, risk_appetite, loan_type
 */

const { getRecommendations } = require('../services/recommendationService');

const recommend = async (req, res) => {
    try {
        const { monthly_salary, spending_profile, risk_appetite, loan_type } = req.query;
        const data = await getRecommendations({ monthly_salary, spending_profile, risk_appetite, loan_type });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { recommend };
