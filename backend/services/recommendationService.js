/**
 * services/recommendationService.js
 * Rule-based recommendation engine.
 * No external AI — pure business logic on PostgreSQL data.
 *
 * Rules:
 *  - Low income (<30K/mo)      → free/low-fee credit cards
 *  - Travel spender             → travel reward cards
 *  - Shopping spender           → shopping/cashback cards
 *  - Low risk appetite          → public bank FDs with high rating
 *  - Medium risk                → private bank FDs / general loans
 *  - High income (>1L/mo)       → premium travel / lounge access cards
 */

const { CreditCard, Loan, FixedDeposit, Bank } = require('../models');
const { MOCK_CREDIT_CARDS, MOCK_LOANS, MOCK_FDS } = require('../config/mockData');

const BANK_INCLUDE = { model: Bank, as: 'bank', attributes: ['id', 'name', 'bank_type', 'logo_url'] };

async function getRecommendations({ monthly_salary, spending_profile, risk_appetite, loan_type }) {
    const isDb = !!(CreditCard);
    const results = { cards: [], loans: [], fds: [], message: '' };

    const salary = parseInt(monthly_salary) || 30000;
    const profile = spending_profile || 'general';
    const risk = risk_appetite || 'medium';

    // ── Credit Card logic ───────────────────────────────────────────────
    let cardWhere = { is_active: true };
    let cardOrder = [['rating', 'DESC']];
    let cardMsg = '';

    if (salary < 20000) {
        cardWhere.annual_fee = { $lte: 0 };  // Free cards
        cardMsg = 'Low annual-fee cards (matching your income range)';
    } else if (salary < 50000) {
        cardWhere.annual_fee = {};  // Up to 1000
        cardMsg = 'Value-for-money cards under ₹1000 annual fee';
    } else if (salary >= 100000) {
        cardWhere.lounge_access = true;
        cardMsg = 'Premium cards with airport lounge access';
    }

    if (profile === 'travel') {
        cardWhere.rewards_type = 'travel';
        cardMsg = 'Top travel rewards cards for frequent flyers';
    } else if (profile === 'shopping') {
        cardWhere.rewards_type = { in: ['cashback', 'shopping'] };
        cardMsg = 'Best cashback & shopping rewards cards';
    } else if (profile === 'fuel') {
        cardWhere.rewards_type = 'fuel';
        cardMsg = 'Fuel cards with surcharge waiver';
    } else if (profile === 'dining') {
        cardWhere.rewards_type = 'dining';
        cardMsg = 'Best dining rewards cards';
    }

    // ── Loan logic ──────────────────────────────────────────────────────
    let loanWhere = { is_active: true, loan_type: loan_type || 'personal' };
    let loanOrder = [['interest_rate', 'ASC']];

    // ── FD logic ────────────────────────────────────────────────────────
    let fdWhere = { is_active: true };
    let fdOrder = [['interest_rate', 'DESC']];

    if (risk === 'low') {
        // Prefer public/PSU banks for FDs (safer)
        fdOrder = [['rating', 'DESC'], ['interest_rate', 'DESC']];
    } else if (risk === 'high') {
        // Small finance / NBFC for higher rates
        fdWhere['$bank.bank_type$'] = { in: ['small_finance', 'nbfc'] };
    }

    try {
        if (isDb) {
            const { Op } = require('sequelize');
            // Convert our simple filter objects to proper Sequelize Op
            const resolveWhere = (w) => {
                const out = {};
                for (const [k, v] of Object.entries(w)) {
                    if (v && v.$lte !== undefined) out[k] = { [Op.lte]: v.$lte };
                    else if (v && v.in !== undefined) out[k] = { [Op.in]: v.in };
                    else out[k] = v;
                }
                return out;
            };

            const [cards, loans, fds] = await Promise.all([
                CreditCard.findAll({ where: resolveWhere(cardWhere), include: [BANK_INCLUDE], order: cardOrder, limit: 5 }),
                Loan.findAll({ where: loanWhere, include: [BANK_INCLUDE], order: loanOrder, limit: 5 }),
                FixedDeposit.findAll({ where: resolveWhere(fdWhere), include: [{ ...BANK_INCLUDE, where: risk === 'low' ? { bank_type: ['public', 'private'] } : {} }], order: fdOrder, limit: 5 }),
            ]);
            results.cards = cards.length ? cards : getMockCards(profile, salary);
            results.loans = loans.length ? loans : getMockLoans(loan_type);
            results.fds = fds.length ? fds : getMockFDs(risk);
        } else {
            results.cards = getMockCards(profile, salary);
            results.loans = getMockLoans(loan_type);
            results.fds = getMockFDs(risk);
        }
    } catch {
        results.cards = getMockCards(profile, salary);
        results.loans = getMockLoans(loan_type);
        results.fds = getMockFDs(risk);
    }

    results.message = cardMsg || `Recommendations based on your profile (${profile}, ₹${salary.toLocaleString('en-IN')}/mo)`;
    return results;
}

function getMockCards(profile, salary) {
    let pool = [...MOCK_CREDIT_CARDS].filter(c => c.is_active !== false);
    if (profile === 'travel') pool = pool.filter(c => c.rewards_type === 'travel');
    else if (profile === 'shopping' || profile === 'dining') pool = pool.filter(c => ['cashback', 'shopping'].includes(c.rewards_type));
    else if (profile === 'fuel') pool = pool.filter(c => c.rewards_type === 'fuel');
    if (salary < 25000) pool = pool.filter(c => c.annual_fee <= 499);
    return pool.sort((a, b) => b.rating - a.rating).slice(0, 5);
}

function getMockLoans(loanType = 'personal') {
    return MOCK_LOANS.filter(l => l.loan_type === loanType).sort((a, b) => a.interest_rate - b.interest_rate).slice(0, 5);
}

function getMockFDs(risk = 'medium') {
    let pool = [...MOCK_FDS];
    if (risk === 'low') pool = pool.filter(f => ['public', 'private'].includes(f.bank_type));
    else if (risk === 'high') pool = pool.filter(f => ['small_finance', 'nbfc'].includes(f.bank_type));
    return pool.sort((a, b) => b.interest_rate - a.interest_rate).slice(0, 5);
}

module.exports = { getRecommendations };
