/**
 * routes/dataRoutes.js
 * FinGuide – Unified public data API
 *
 * GET /api/cards   – credit cards (filtered, sorted, paginated)
 * GET /api/loans   – loans        (filtered, sorted, paginated)
 * GET /api/fds     – fixed deposits (filtered, sorted, paginated)
 * GET /api/banks   – all active banks (for dropdowns)
 * GET /api/stats   – homepage counters (live DB counts)
 */

'use strict';

const router = require('express').Router();
const { Op } = require('sequelize');

// ── Helpers ──────────────────────────────────────────────────────────────────

function paginate(query, page, limit) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 12));
  return { offset: (p - 1) * l, limit: l, page: p };
}

function indianFmt(n) { return Number(n).toLocaleString('en-IN'); }

function sendPage(res, { rows, count }, page, limit) {
  return res.json({
    success: true,
    data: rows,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
  });
}

function errRes(res, err, label) {
  console.error(`[dataRoutes] ${label}:`, err.message);
  return res.status(500).json({ success: false, message: 'Failed to load data. Please try again.' });
}

// ── GET /api/cards ────────────────────────────────────────────────────────────
router.get('/cards', async (req, res) => {
  try {
    const { CreditCard, Bank } = require('../models');
    if (!CreditCard) return res.status(503).json({ success: false, message: 'Database not connected.' });

    const {
      search, minFee, maxFee, rewardsType, rewards_type,
      network, lounge, lounge_access,
      sortBy, sort,
      page, limit,
    } = req.query;

    const { offset, limit: lim, page: pg } = paginate(page, limit);

    // WHERE clauses
    const where = { is_active: true };

    const searchTerm = search || '';
    // We filter by card_name; bank name filter is applied via include below
    if (searchTerm) {
      where[Op.or] = [
        { card_name: { [Op.like]: `%${searchTerm}%` } },
      ];
    }

    const feeMax = maxFee !== undefined && maxFee !== '' ? parseFloat(maxFee) : null;
    const feeMin = minFee !== undefined && minFee !== '' ? parseFloat(minFee) : null;
    if (feeMax !== null && feeMax === 0) where.annual_fee = 0;
    else {
      const feeClause = {};
      if (feeMin !== null) feeClause[Op.gte] = feeMin;
      if (feeMax !== null) feeClause[Op.lte] = feeMax;
      if (Object.keys(feeClause).length) where.annual_fee = feeClause;
    }

    const rType = rewardsType || rewards_type || '';
    if (rType) where.rewards_type = rType;

    const net = network || '';
    if (net) where.network = net;

    const loungeVal = lounge || lounge_access || '';
    if (loungeVal === 'true' || loungeVal === true) where.lounge_access = true;

    // ORDER
    const sortKey = sortBy || sort || 'annual_fee_asc';
    const orderMap = {
      annual_fee_asc:   [['annual_fee', 'ASC']],
      annual_fee_desc:  [['annual_fee', 'DESC']],
      fee:              [['annual_fee', 'ASC']],
      cashback_desc:    [['cashback', 'DESC']],
      cashback:         [['cashback', 'DESC']],
      name_asc:         [['card_name', 'ASC']],
      rating:           [['rating', 'DESC']],
      rate:             [['interest_rate', 'ASC']],
      newest:           [['createdAt', 'DESC']],
    };
    const order = orderMap[sortKey] || [['annual_fee', 'ASC']];

    // Bank include – also used to filter by bank name if search term given
    const bankWhere = { is_active: true };
    if (searchTerm) bankWhere.name = { [Op.like]: `%${searchTerm}%` };

    const { count, rows } = await CreditCard.findAndCountAll({
      where,
      include: [{
        model: Bank,
        as: 'bank',
        attributes: ['id', 'name', 'bank_type', 'logo_url'],
        // if search term: EITHER card name matches OR bank name matches
        required: false,
      }],
      order,
      limit: lim,
      offset,
      distinct: true,
    });

    // If search term, post-filter rows where neither card_name nor bank.name matches
    let filteredRows = rows;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredRows = rows.filter(c =>
        (c.card_name || '').toLowerCase().includes(term) ||
        (c.bank?.name || '').toLowerCase().includes(term)
      );
    }

    // Flatten bank info for easy frontend consumption
    const data = filteredRows.map(c => {
      const j = c.toJSON();
      j.bank_name = j.bank?.name || '';
      j.bank_type = j.bank?.bank_type || '';
      j.logo_url  = j.bank?.logo_url || '';
      return j;
    });

    return res.json({
      success: true,
      data,
      total: searchTerm ? filteredRows.length : count,
      page: pg,
      totalPages: Math.ceil((searchTerm ? filteredRows.length : count) / lim),
    });
  } catch (err) {
    return errRes(res, err, 'GET /cards');
  }
});

// ── GET /api/loans ────────────────────────────────────────────────────────────
router.get('/loans', async (req, res) => {
  try {
    const { Loan, Bank } = require('../models');
    if (!Loan) return res.status(503).json({ success: false, message: 'Database not connected.' });

    const {
      search, minRate, min_rate, maxRate, max_rate,
      maxAmount, max_amount, loanType, loan_type,
      sortBy, sort,
      page, limit,
    } = req.query;

    const { offset, limit: lim, page: pg } = paginate(page, limit);

    const where = { is_active: true };

    const rateMin = parseFloat(minRate || min_rate || '') || null;
    const rateMax = parseFloat(maxRate || max_rate || '') || null;
    if (rateMin !== null || rateMax !== null) {
      const rc = {};
      if (rateMin !== null) rc[Op.gte] = rateMin;
      if (rateMax !== null) rc[Op.lte] = rateMax;
      where.interest_rate = rc;
    }

    const amtMax = parseFloat(maxAmount || max_amount || '') || null;
    if (amtMax !== null) where.max_amount = { [Op.lte]: amtMax };

    const lType = loanType || loan_type || '';
    if (lType) where.loan_type = lType;

    const sortKey = sortBy || sort || 'rate_asc';
    const orderMap = {
      rate_asc:    [['interest_rate', 'ASC']],
      rate_desc:   [['interest_rate', 'DESC']],
      rate:        [['interest_rate', 'ASC']],
      amount_desc: [['max_amount', 'DESC']],
      name_asc:    [['loan_name', 'ASC']],
      rating:      [['rating', 'DESC']],
      fee:         [['processing_fee', 'ASC']],
    };
    const order = orderMap[sortKey] || [['interest_rate', 'ASC']];

    const searchTerm = search || '';

    const { count, rows } = await Loan.findAndCountAll({
      where,
      include: [{
        model: Bank,
        as: 'bank',
        attributes: ['id', 'name', 'bank_type', 'logo_url'],
        required: false,
      }],
      order,
      limit: lim,
      offset,
      distinct: true,
    });

    let filteredRows = rows;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredRows = rows.filter(l =>
        (l.loan_name || '').toLowerCase().includes(term) ||
        (l.bank?.name || '').toLowerCase().includes(term)
      );
    }

    const data = filteredRows.map(l => {
      const j = l.toJSON();
      j.bank_name = j.bank?.name || '';
      j.bank_type = j.bank?.bank_type || '';
      j.logo_url  = j.bank?.logo_url || '';
      return j;
    });

    return res.json({
      success: true,
      data,
      total: searchTerm ? filteredRows.length : count,
      page: pg,
      totalPages: Math.ceil((searchTerm ? filteredRows.length : count) / lim),
    });
  } catch (err) {
    return errRes(res, err, 'GET /loans');
  }
});

// ── GET /api/fds ──────────────────────────────────────────────────────────────
router.get('/fds', async (req, res) => {
  try {
    const { FixedDeposit, Bank } = require('../models');
    if (!FixedDeposit) return res.status(503).json({ success: false, message: 'Database not connected.' });

    const {
      search, minRate, min_rate, maxRate, max_rate,
      tenureMin, tenure_min, tenureMax, tenure_max,
      bank_type, bankType,
      sortBy, sort,
      page, limit,
    } = req.query;

    const { offset, limit: lim, page: pg } = paginate(page, limit);

    const where = { is_active: true };

    const rateMin = parseFloat(minRate || min_rate || '') || null;
    const rateMax = parseFloat(maxRate || max_rate || '') || null;
    if (rateMin !== null || rateMax !== null) {
      const rc = {};
      if (rateMin !== null) rc[Op.gte] = rateMin;
      if (rateMax !== null) rc[Op.lte] = rateMax;
      where.interest_rate = rc;
    }

    const tMin = parseInt(tenureMin || tenure_min || '') || null;
    const tMax = parseInt(tenureMax || tenure_max || '') || null;
    if (tMin !== null) where.min_tenure = { [Op.gte]: tMin };
    if (tMax !== null) where.max_tenure = { [Op.lte]: tMax };

    const sortKey = sortBy || sort || 'rate_desc';
    const orderMap = {
      rate_desc:         [['interest_rate', 'DESC']],
      rate_asc:          [['interest_rate', 'ASC']],
      rate:              [['interest_rate', 'DESC']],
      senior_rate_desc:  [['senior_citizen_rate', 'DESC']],
      name_asc:          [['scheme_name', 'ASC']],
      name:              [['scheme_name', 'ASC']],
      min_amount_asc:    [['min_amount', 'ASC']],
      rating:            [['rating', 'DESC']],
    };
    const order = orderMap[sortKey] || [['interest_rate', 'DESC']];

    const bType = bank_type || bankType || '';
    const bankWhere = { is_active: true };
    if (bType) bankWhere.bank_type = bType;

    const searchTerm = search || '';

    const { count, rows } = await FixedDeposit.findAndCountAll({
      where,
      include: [{
        model: Bank,
        as: 'bank',
        attributes: ['id', 'name', 'bank_type', 'logo_url'],
        where: bType ? bankWhere : { is_active: true },
        required: !!bType,
      }],
      order,
      limit: lim,
      offset,
      distinct: true,
    });

    let filteredRows = rows;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredRows = rows.filter(f =>
        (f.scheme_name || '').toLowerCase().includes(term) ||
        (f.bank?.name || '').toLowerCase().includes(term)
      );
    }

    const data = filteredRows.map(f => {
      const j = f.toJSON();
      j.bank_name = j.bank?.name || '';
      j.bank_type = j.bank?.bank_type || '';
      j.logo_url  = j.bank?.logo_url || '';
      return j;
    });

    return res.json({
      success: true,
      data,
      total: searchTerm ? filteredRows.length : count,
      page: pg,
      totalPages: Math.ceil((searchTerm ? filteredRows.length : count) / lim),
    });
  } catch (err) {
    return errRes(res, err, 'GET /fds');
  }
});

// ── GET /api/banks ────────────────────────────────────────────────────────────
router.get('/banks', async (req, res) => {
  try {
    const { Bank } = require('../models');
    if (!Bank) return res.status(503).json({ success: false, message: 'Database not connected.' });

    const rows = await Bank.findAll({
      where: { is_active: true },
      attributes: ['id', 'name', 'bank_type', 'logo_url'],
      order: [['name', 'ASC']],
    });

    return res.json({ success: true, data: rows });
  } catch (err) {
    return errRes(res, err, 'GET /banks');
  }
});

// ── GET /api/stats ────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { CreditCard, Loan, FixedDeposit, Bank, ScraperLog } = require('../models');
    if (!CreditCard) return res.status(503).json({ success: false, message: 'Database not connected.' });

    const [totalCards, totalLoans, totalFDs, totalBanks, lastLog] = await Promise.all([
      CreditCard.count({ where: { is_active: true } }),
      Loan.count({ where: { is_active: true } }),
      FixedDeposit.count({ where: { is_active: true } }),
      Bank.count({ where: { is_active: true } }),
      ScraperLog
        ? ScraperLog.findOne({ order: [['createdAt', 'DESC']], attributes: ['createdAt'] })
        : Promise.resolve(null),
    ]);

    return res.json({
      success: true,
      data: {
        totalCards,
        totalLoans,
        totalFDs,
        totalBanks,
        lastUpdated: lastLog?.createdAt || new Date().toISOString(),
      },
    });
  } catch (err) {
    return errRes(res, err, 'GET /stats');
  }
});

module.exports = router;
