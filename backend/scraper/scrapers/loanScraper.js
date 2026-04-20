/**
 * scraper/scrapers/loanScraper.js  — 3-TIER ARCHITECTURE
 *
 * ══════════════════════════════════════════════════════════════════════
 * Pipeline:
 *   Tier 3 (Fallback) — FALLBACK_LOANS array   → guaranteed base (12 banks)
 *   Tier 1 (RBI)      — rbiScraper.js          → benchmark lending rates
 *   Tier 2 (Live)     — loanScraperLive.js     → live aggregator rates
 *
 * smartMerge:
 *   1. Start with Tier 3 as base
 *   2. For each bank in fallback, if Tier 1/2 has newer rate → update rate
 *   3. Add new banks from Tier 2 not in fallback
 *   4. Deduplicate by bankName slug
 *   5. SCRAPE_MODE check removed — always runs all tiers
 * ══════════════════════════════════════════════════════════════════════
 */

'use strict';

const { canonicalBankName } = require('../utils/normalizer');
const { slugify } = require('../utils/parsers');
const { scrapeRBI }            = require('../sources/rbiScraper');
const { scrapeLoanSourcesLive } = require('../sources/loanScraperLive');

// ── Bank Type Helper ───────────────────────────────────────────────────────────

function guessBankType(bankName) {
  const pub = [
    'State Bank', 'Punjab National', 'Bank of Baroda', 'Canara',
    'Union Bank', 'Bank of India', 'Central Bank', 'Indian Bank',
  ];
  return pub.some(p => bankName.includes(p)) ? 'public' : 'private';
}

// ── Tier 3 Fallback Dataset ────────────────────────────────────────────────────

const FALLBACK_LOANS = [
  { bankName: 'HDFC Bank',             loanName: 'HDFC Personal Loan',          loanType: 'personal', interestRate: 10.75, processingFee: 2.5,  minTenure: 12, maxTenure: 60, minAmount: 50000,  maxAmount: 4000000, applyUrl: 'https://www.hdfcbank.com/personal/borrow/popular-loans/personal-loan' },
  { bankName: 'State Bank of India',   loanName: 'SBI Xpress Credit',           loanType: 'personal', interestRate: 11.45, processingFee: 1.5,  minTenure: 6,  maxTenure: 84, minAmount: 25000,  maxAmount: 2000000, applyUrl: 'https://sbi.co.in/web/personal-banking/loans/personal-loans/xpress-credit' },
  { bankName: 'State Bank of India',   loanName: 'SBI Quick Personal Loan',     loanType: 'personal', interestRate: 12.50, processingFee: 1.0,  minTenure: 12, maxTenure: 60, minAmount: 10000,  maxAmount: 2000000, applyUrl: 'https://sbi.co.in/web/personal-banking/loans/personal-loans' },
  { bankName: 'ICICI Bank',            loanName: 'ICICI Personal Loan',         loanType: 'personal', interestRate: 10.75, processingFee: 2.25, minTenure: 12, maxTenure: 72, minAmount: 50000,  maxAmount: 5000000, applyUrl: 'https://www.icicibank.com/personal-banking/loans/personal-loan' },
  { bankName: 'Axis Bank',             loanName: 'Axis Personal Loan',          loanType: 'personal', interestRate: 11.25, processingFee: 2.0,  minTenure: 12, maxTenure: 60, minAmount: 50000,  maxAmount: 4000000, applyUrl: 'https://www.axisbank.com/retail/loans/personal-loan' },
  { bankName: 'Kotak Mahindra Bank',   loanName: 'Kotak Personal Loan',         loanType: 'personal', interestRate: 10.99, processingFee: 2.5,  minTenure: 12, maxTenure: 60, minAmount: 50000,  maxAmount: 4000000, applyUrl: 'https://www.kotak.com/en/personal-banking/loans/personal-loan.html' },
  { bankName: 'Punjab National Bank',  loanName: 'PNB Personal Loan',           loanType: 'personal', interestRate: 11.40, processingFee: 1.0,  minTenure: 12, maxTenure: 60, minAmount: 10000,  maxAmount: 1000000, applyUrl: 'https://www.pnbindia.in/personal-loan.html' },
  { bankName: 'Bank of Baroda',        loanName: 'BOB Personal Loan',           loanType: 'personal', interestRate: 11.05, processingFee: 2.0,  minTenure: 12, maxTenure: 60, minAmount: 50000,  maxAmount: 1500000, applyUrl: 'https://www.bankofbaroda.in/personal-banking/loans/personal-loan' },
  { bankName: 'Yes Bank',              loanName: 'Yes Bank Personal Loan',      loanType: 'personal', interestRate: 11.05, processingFee: 2.5,  minTenure: 12, maxTenure: 60, minAmount: 100000, maxAmount: 4000000, applyUrl: 'https://www.yesbank.in/personal-banking/yes-individual/loans/personal-loan' },
  { bankName: 'IndusInd Bank',         loanName: 'IndusInd Personal Loan',      loanType: 'personal', interestRate: 10.49, processingFee: 3.0,  minTenure: 12, maxTenure: 60, minAmount: 30000,  maxAmount: 5000000, applyUrl: 'https://www.indusind.com/in/en/personal/loans/personal-loan.html' },
  { bankName: 'IDFC First Bank',       loanName: 'IDFC First Personal Loan',    loanType: 'personal', interestRate: 10.49, processingFee: 3.5,  minTenure: 6,  maxTenure: 60, minAmount: 20000,  maxAmount: 4000000, applyUrl: 'https://www.idfcfirstbank.com/personal-loan' },
  { bankName: 'Canara Bank',           loanName: 'Canara Personal Loan',        loanType: 'personal', interestRate: 12.40, processingFee: 0.5,  minTenure: 12, maxTenure: 60, minAmount: 10000,  maxAmount: 1000000, applyUrl: 'https://canarabank.com/User_page.aspx?othlink=8&menuid=4&submenu=5' },
  { bankName: 'AU Small Finance Bank', loanName: 'AU Bank Personal Loan',       loanType: 'personal', interestRate: 12.00, processingFee: 2.0,  minTenure: 12, maxTenure: 60, minAmount: 50000,  maxAmount: 1500000, applyUrl: 'https://www.aubank.in/personal-banking/borrow/personal-loan' },
  { bankName: 'RBL Bank',             loanName: 'RBL Personal Loan',           loanType: 'personal', interestRate: 14.00, processingFee: 3.0,  minTenure: 12, maxTenure: 60, minAmount: 100000, maxAmount: 3500000, applyUrl: 'https://www.rblbank.com/loans/personal-loan' },
  { bankName: 'Federal Bank',          loanName: 'Federal Bank Personal Loan',  loanType: 'personal', interestRate: 11.99, processingFee: 1.5,  minTenure: 12, maxTenure: 60, minAmount: 50000,  maxAmount: 2500000, applyUrl: 'https://www.federalbank.co.in/personal-loan' },
  { bankName: 'Union Bank of India',   loanName: 'Union Bank Personal Loan',    loanType: 'personal', interestRate: 11.35, processingFee: 1.0,  minTenure: 12, maxTenure: 60, minAmount: 10000,  maxAmount: 1500000, applyUrl: 'https://www.unionbankofindia.co.in/english/personal-loan.aspx' },
];

// ── Smart Merge ────────────────────────────────────────────────────────────────

/**
 * Merge fallback loans with RBI + live data.
 *
 * @param {Object[]} fallback    Tier 3 base loans
 * @param {Object[]} rbiRates    Tier 1 RBI lending rates [{bankName, rate, rateType}]
 * @param {Object[]} liveLoans  Tier 2 live scraped loans
 * @returns {{ merged: Object[], tier1Count, tier2Count, fallbackCount, newBanks }}
 */
function smartMergeLoans(fallback, rbiRates, liveLoans) {
  // Build lookup maps
  const fallbackMap = new Map();
  for (const loan of fallback) {
    const key = slugify(canonicalBankName(loan.bankName));
    if (!fallbackMap.has(key)) fallbackMap.set(key, { ...loan });
  }

  // Build RBI lending rate lookup: bankName → rate
  const rbiLendingMap = new Map();
  for (const r of rbiRates) {
    if (r.rateType === 'lending') {
      const key = slugify(r.bankName);
      rbiLendingMap.set(key, r.rate);
    }
  }

  let tier1Count    = 0;
  let tier2Count    = 0;
  const newBanks    = [];

  // Apply Tier 1 (RBI) rate updates
  for (const [key, loan] of fallbackMap) {
    if (rbiLendingMap.has(key)) {
      const rbiRate = rbiLendingMap.get(key);
      // RBI rates are base rates, personal loans are typically RBI + spread
      // Only update if RBI rate is meaningfully different (>0.5% change)
      if (Math.abs(rbiRate - loan.interestRate) > 0.5) {
        loan.interestRate = rbiRate;
        loan._updatedByTier1 = true;
        tier1Count++;
      }
    }
  }

  // Apply Tier 2 (live) updates
  for (const liveLoan of liveLoans) {
    const key = slugify(canonicalBankName(liveLoan.bankName));
    if (!key) continue;

    if (fallbackMap.has(key)) {
      const existing = fallbackMap.get(key);
      // Update with live rate if it's a valid, more recent value
      if (liveLoan.interestRate > 0 && liveLoan.interestRate !== existing.interestRate) {
        existing.interestRate  = liveLoan.interestRate;
        existing.processingFee = liveLoan.processingFee || existing.processingFee;
        existing._updatedByTier2 = true;
        tier2Count++;
      }
    } else {
      // New bank not in fallback
      fallbackMap.set(key, {
        bankName:      canonicalBankName(liveLoan.bankName),
        loanName:      liveLoan.loanName || `${canonicalBankName(liveLoan.bankName)} Personal Loan`,
        loanType:      'personal',
        interestRate:  liveLoan.interestRate,
        processingFee: liveLoan.processingFee || 2.0,
        minTenure:     liveLoan.minTenure || 12,
        maxTenure:     liveLoan.maxTenure || 60,
        minAmount:     liveLoan.minAmount || 50000,
        maxAmount:     liveLoan.maxAmount || 3000000,
        applyUrl:      liveLoan.applyUrl || '',
        _fromTier2:    true,
      });
      newBanks.push(canonicalBankName(liveLoan.bankName));
      tier2Count++;
    }
  }

  const merged       = Array.from(fallbackMap.values()).filter(l => l.interestRate > 0);
  const fallbackCount = fallback.length - tier1Count - tier2Count;

  return {
    merged,
    tier1Count,
    tier2Count,
    fallbackCount: Math.max(fallbackCount, 0),
    newBanks: [...new Set(newBanks)],
  };
}

// ── Log Helper ─────────────────────────────────────────────────────────────────

async function _logRun(ScraperLog, section, records, status, errorMsg) {
  if (!ScraperLog) return;
  await ScraperLog.create({
    section,
    records_updated: records,
    status,
    error_message:   errorMsg || null,
    run_at:          new Date(),
  }).catch(e => console.warn('[ScraperLog] Write failed:', e.message));
}

// ── Main Exported Function ─────────────────────────────────────────────────────

/**
 * Full 3-tier personal loan scrape + DB upsert.
 *
 * @param {{ Bank, Loan, ScraperLog, sequelize }} modelBag
 * @returns {Promise<{ section, recordsUpdated, status, tierBreakdown }>}
 */
async function runLoanScraper({ Bank, Loan, ScraperLog, sequelize }) {
  const startTime = Date.now();
  console.log('\n[Loan Scraper] ══ 3-Tier Run Starting ══');

  // ── TIER 3: Fallback ──────────────────────────────────────────────────────
  console.log(`[Loan Scraper] 📦 Tier 3 (Fallback): ${FALLBACK_LOANS.length} loans loaded`);

  // ── TIER 1: RBI ───────────────────────────────────────────────────────────
  let rbiResult = { data: [], count: 0, usedFallback: true };
  try {
    console.log('[Loan Scraper] 📊 Tier 1 (RBI): fetching benchmark rates...');
    rbiResult = await scrapeRBI();
    const lendingCount = rbiResult.data.filter(r => r.rateType === 'lending').length;
    if (lendingCount > 0) {
      console.log(`  ✅ [Loan] RBI lending rates: ${lendingCount} banks`);
    } else {
      console.log(`  ⚠️  [Loan] RBI returned 0 lending rates — continuing without Tier 1`);
    }
  } catch (err) {
    console.log(`  ❌ [Loan] Tier 1 (RBI) failed: ${err.message}`);
  }

  // ── TIER 2: Live Aggregators ───────────────────────────────────────────────
  let tier2Result = { loans: [], count: 0, sourceBreakdown: {}, errors: [] };
  try {
    console.log('[Loan Scraper] 🌐 Tier 2 (Live Aggregators): fetching...');
    tier2Result = await scrapeLoanSourcesLive();
    console.log(`[Loan Scraper] Tier 2 total: ${tier2Result.count} loans`);
    if (tier2Result.sourceBreakdown) {
      for (const [src, cnt] of Object.entries(tier2Result.sourceBreakdown)) {
        console.log(`            └─ ${src}: ${cnt}`);
      }
    }
  } catch (err) {
    console.log(`[Loan Scraper] ❌ Tier 2 entirely failed: ${err.message}`);
  }

  // ── SMART MERGE ────────────────────────────────────────────────────────────
  const { merged, tier1Count, tier2Count, fallbackCount, newBanks } = smartMergeLoans(
    FALLBACK_LOANS,
    rbiResult.data,
    tier2Result.loans,
  );

  console.log(`[Loan Scraper] 🔀 Merge result: ${merged.length} loans`);
  console.log(`            ├─ Tier 1 (RBI rate updates):  ${tier1Count}`);
  console.log(`            ├─ Tier 2 (live updates):      ${tier2Count}`);
  console.log(`            ├─ Fallback only:              ${fallbackCount}`);
  console.log(`            └─ New banks from Tier 2:      ${newBanks.length > 0 ? newBanks.join(', ') : 'none'}`);

  if (merged.length === 0) {
    await _logRun(ScraperLog, 'loans', 0, 'failed', 'No data from any tier');
    return { section: 'loans', recordsUpdated: 0, status: 'failed' };
  }

  // ── DB UPSERT ─────────────────────────────────────────────────────────────
  let recordsUpdated = 0;
  const errors = [];
  const t = await sequelize.transaction();

  try {
    for (const loan of merged) {
      try {
        const bankName = canonicalBankName(loan.bankName);
        const [bankRecord] = await Bank.findOrCreate({
          where:    { name: bankName },
          defaults: { name: bankName, bank_type: guessBankType(bankName), is_active: true },
          transaction: t,
        });

        const loanData = {
          bank_id:        bankRecord.id,
          loan_name:      loan.loanName || `${bankName} Personal Loan`,
          loan_type:      loan.loanType || 'personal',
          interest_rate:  loan.interestRate ?? 12.0,
          processing_fee: loan.processingFee ?? 2.0,
          min_tenure:     loan.minTenure ?? 12,
          max_tenure:     loan.maxTenure ?? 60,
          min_amount:     loan.minAmount ?? 50000,
          max_amount:     loan.maxAmount ?? 2500000,
          apply_url:      loan.applyUrl ?? '',
          is_active:      true,
          last_updated:   new Date(),
        };

        const existing = await Loan.findOne({
          where: { bank_id: bankRecord.id, loan_name: loanData.loan_name },
          transaction: t,
        });

        if (existing) {
          await existing.update(loanData, { transaction: t });
        } else {
          await Loan.create(loanData, { transaction: t });
        }
        recordsUpdated++;
      } catch (rowErr) {
        errors.push(`${loan.bankName}/${loan.loanName}: ${rowErr.message}`);
      }
    }

    await t.commit();

    const status      = errors.length === 0 ? 'success' : 'partial';
    const elapsed     = ((Date.now() - startTime) / 1000).toFixed(1);
    const tierBreakdown = { tier1_count: tier1Count, tier2_count: tier2Count, fallback_count: fallbackCount, total: recordsUpdated };

    await _logRun(ScraperLog, 'loans', recordsUpdated, status, errors.slice(0, 5).join('; ') || null);
    console.log(`[Loan Scraper] ✅ Done — ${recordsUpdated} records in ${elapsed}s`);
    if (errors.length) console.log(`[Loan Scraper] ⚠️  ${errors.length} row errors`);

    return { section: 'loans', recordsUpdated, status, tierBreakdown };

  } catch (err) {
    await t.rollback();
    console.error('[Loan Scraper] ❌ Transaction failed:', err.message);
    await _logRun(ScraperLog, 'loans', 0, 'failed', err.message);
    throw err;
  }
}

module.exports = { runLoanScraper };
