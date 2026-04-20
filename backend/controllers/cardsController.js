/**
 * controllers/cardsController.js
 * Handles the aggregated /api/cards endpoints:
 *
 *   GET  /api/cards           → paginated, filtered list of credit cards
 *   POST /api/cards/sync      → trigger a full multi-source scrape (admin)
 *
 * Falls back to the JSON seed file when the database is not available,
 * so the demo never breaks.
 */

'use strict';

const path = require('path');
const { Op }       = require('sequelize');
const { CreditCard, Bank, ScraperLog } = require('../models');
const FALLBACK_CARDS = require('../scraper/data/fallbackCards.json');

const isDb = () => !!CreditCard;

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyFiltersToFallback(cards, q) {
  let r = cards.filter(c => c.is_active !== false);
  if (q.rewards_type && q.rewards_type !== 'all')
    r = r.filter(c => c.rewards_type === q.rewards_type);
  if (q.min_cashback)
    r = r.filter(c => (c.cashback || 0) >= parseFloat(q.min_cashback));
  if (q.max_fee !== undefined && q.max_fee !== '')
    r = r.filter(c => c.annual_fee <= parseFloat(q.max_fee));
  if (q.min_fee !== undefined && q.min_fee !== '')
    r = r.filter(c => c.annual_fee >= parseFloat(q.min_fee));
  if (q.network)
    r = r.filter(c => c.network === q.network);
  if (q.lounge_access === 'true')
    r = r.filter(c => c.lounge_access);
  if (q.bank)
    r = r.filter(c => (c.bankName || '').toLowerCase().includes(q.bank.toLowerCase()));
  if (q.search) {
    const s = q.search.toLowerCase();
    r = r.filter(c =>
      c.card_name?.toLowerCase().includes(s) ||
      c.bankName?.toLowerCase().includes(s)
    );
  }
  const sortFns = {
    rating:   (a, b) => (b.rating || 3.5) - (a.rating || 3.5),
    cashback: (a, b) => (b.cashback || 0) - (a.cashback || 0),
    fee:      (a, b) => (a.annual_fee || 0) - (b.annual_fee || 0),
    rate:     (a, b) => (a.interest_rate || 36) - (b.interest_rate || 36),
  };
  r.sort(sortFns[q.sort] || sortFns.rating);
  const page  = Math.max(1, parseInt(q.page) || 1);
  const limit = Math.min(100, parseInt(q.limit) || 30);
  const total = r.length;
  return { data: r.slice((page - 1) * limit, page * limit), total, page, limit };
}

// ── GET /api/cards ────────────────────────────────────────────────────────────

const getCards = async (req, res) => {
  try {
    const {
      rewards_type, min_cashback, max_fee, min_fee,
      sort = 'rating', limit = 30, page = 1,
      network, lounge_access, bank, search,
      source,
    } = req.query;

    if (isDb()) {
      const where = { is_active: true };
      if (rewards_type && rewards_type !== 'all') where.rewards_type = rewards_type;
      if (min_cashback) where.cashback = { [Op.gte]: parseFloat(min_cashback) };
      if (max_fee !== undefined && max_fee !== '')
        where.annual_fee = { ...(where.annual_fee || {}), [Op.lte]: parseFloat(max_fee) };
      if (min_fee !== undefined && min_fee !== '')
        where.annual_fee = { ...(where.annual_fee || {}), [Op.gte]: parseFloat(min_fee) };
      if (network) where.network = network;
      if (lounge_access === 'true') where.lounge_access = true;
      // MySQL-compatible LIKE (use Op.like not Op.iLike)
      if (search)
        where[Op.or] = [
          { card_name: { [Op.like]: `%${search}%` } },
        ];

      const sortMap = {
        rating:   [['rating', 'DESC']],
        cashback: [['cashback', 'DESC']],
        fee:      [['annual_fee', 'ASC']],
        rate:     [['interest_rate', 'ASC']],
      };

      const bankWhere = bank ? { name: { [Op.like]: `%${bank}%` } } : {};

      const { count, rows } = await CreditCard.findAndCountAll({
        where,
        include: [{
          model: Bank,
          as: 'bank',
          attributes: ['id', 'name', 'bank_type', 'logo_url', 'website'],
          where: Object.keys(bankWhere).length ? bankWhere : undefined,
        }],
        order: sortMap[sort] || sortMap.rating,
        limit:  parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
      });

      if (count > 0) {
        return res.json({
          success: true,
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          data: rows,
          source: 'database',
        });
      }
    }

    // Database unavailable or empty → serve fallback
    const { data, total } = applyFiltersToFallback(FALLBACK_CARDS, req.query);
    return res.json({
      success: true,
      total,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 30,
      data,
      source: 'fallback_seed',
    });

  } catch (err) {
    console.error('[GET /api/cards]', err.message);
    const { data, total } = applyFiltersToFallback(FALLBACK_CARDS, req.query);
    return res.json({
      success: true,
      total,
      page: 1,
      limit: 30,
      data,
      source: 'fallback_seed',
    });
  }
};

// ── POST /api/cards/sync ──────────────────────────────────────────────────────

const syncCards = async (req, res) => {
  // Respond immediately so the HTTP client doesn't timeout on a long scrape
  res.json({
    success: true,
    message: 'Multi-source card sync started. Check /api/cards/sync/status for progress.',
    started_at: new Date().toISOString(),
  });

  // Run in background (non-blocking)
  setImmediate(async () => {
    try {
      const { runCreditCardScraper } = require('../scraper/scrapers/creditCardScraper');
      const { sequelize, Bank: BankModel, CreditCard: CCModel, ScraperLog: LogModel } = require('../models');

      if (!sequelize) {
        console.warn('[sync] DB not connected — sync skipped');
        return;
      }

      const result = await runCreditCardScraper({
        Bank: BankModel,
        CreditCard: CCModel,
        ScraperLog: LogModel,
        sequelize,
      });

      console.log('[sync] Complete:', result);
    } catch (err) {
      console.error('[sync] Background job failed:', err.message);
    }
  });
};

// ── GET /api/cards/sync/status ────────────────────────────────────────────────

const getSyncStatus = async (req, res) => {
  try {
    if (!isDb() || !ScraperLog) {
      return res.json({ success: true, data: [], message: 'Database not available' });
    }

    const logs = await ScraperLog.findAll({
      where: { section: { [Op.in]: ['credit_cards', 'all'] } },
      order: [['run_at', 'DESC']],
      limit: 10,
    });

    return res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getCards, syncCards, getSyncStatus };
