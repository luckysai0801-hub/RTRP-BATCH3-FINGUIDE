/**
 * scraper/scrapers/fdScraper.js  — 3-TIER ARCHITECTURE (v2 — RBI merge fixed)
 *
 * ══════════════════════════════════════════════════════════════════════
 * FIXES in this version:
 *   - smartMergeFDs: removed >0.25% threshold — ALL RBI rate updates applied
 *   - smartMergeFDs: RBI bank name normalization fixed (canonicalBankName on
 *     the RBI name BEFORE slugify, so "HDFC Bank Ltd." → "HDFC Bank" → slug)
 *   - smartMergeFDs: bank-level match now works across ALL tenure buckets
 *     for each bank (not just 300-400 day tenure window)
 *   - Added per-bank match/update logging to console
 * ══════════════════════════════════════════════════════════════════════
 */

'use strict';

const { canonicalBankName } = require('../utils/normalizer');
const { slugify } = require('../utils/parsers');
const { scrapeRBI }           = require('../sources/rbiScraper');
const { scrapeFDSourcesLive } = require('../sources/fdScraperLive');

// ── Bank Type Helper ───────────────────────────────────────────────────────────

function guessBankType(bankName) {
  const pub = [
    'State Bank', 'Punjab National', 'Bank of Baroda', 'Canara',
    'Union Bank', 'Bank of India', 'Central Bank', 'Indian Bank',
  ];
  return pub.some(p => bankName.includes(p)) ? 'public' : 'private';
}

// ── Tier 3 Fallback Dataset ────────────────────────────────────────────────────

const FALLBACK_FDS = [
  { bankName: 'HDFC Bank',             schemeName: 'HDFC FD 7-14 Days',          minTenure: 7,    maxTenure: 14,   interestRate: 3.00, seniorRate: 3.50, minAmount: 5000 },
  { bankName: 'HDFC Bank',             schemeName: 'HDFC FD 1 Year',             minTenure: 365,  maxTenure: 365,  interestRate: 6.60, seniorRate: 7.10, minAmount: 5000 },
  { bankName: 'HDFC Bank',             schemeName: 'HDFC FD 15 Months',          minTenure: 450,  maxTenure: 450,  interestRate: 7.10, seniorRate: 7.60, minAmount: 5000 },
  { bankName: 'HDFC Bank',             schemeName: 'HDFC FD 2-3 Years',          minTenure: 730,  maxTenure: 1095, interestRate: 7.00, seniorRate: 7.50, minAmount: 5000 },
  { bankName: 'HDFC Bank',             schemeName: 'HDFC Tax Saver FD',          minTenure: 1825, maxTenure: 1825, interestRate: 7.00, seniorRate: 7.50, minAmount: 100  },
  { bankName: 'State Bank of India',   schemeName: 'SBI FD 7-45 Days',           minTenure: 7,    maxTenure: 45,   interestRate: 3.50, seniorRate: 4.00, minAmount: 1000 },
  { bankName: 'State Bank of India',   schemeName: 'SBI FD 1 Year',              minTenure: 365,  maxTenure: 729,  interestRate: 6.80, seniorRate: 7.30, minAmount: 1000 },
  { bankName: 'State Bank of India',   schemeName: 'SBI Amrit Kalash (400 Days)',minTenure: 400,  maxTenure: 400,  interestRate: 7.10, seniorRate: 7.60, minAmount: 1000 },
  { bankName: 'State Bank of India',   schemeName: 'SBI FD 2-3 Years',           minTenure: 730,  maxTenure: 1095, interestRate: 7.00, seniorRate: 7.50, minAmount: 1000 },
  { bankName: 'State Bank of India',   schemeName: 'SBI Tax Saving FD',          minTenure: 1825, maxTenure: 1825, interestRate: 6.50, seniorRate: 7.00, minAmount: 1000 },
  { bankName: 'ICICI Bank',            schemeName: 'ICICI FD 1 Year',            minTenure: 365,  maxTenure: 389,  interestRate: 6.70, seniorRate: 7.20, minAmount: 10000 },
  { bankName: 'ICICI Bank',            schemeName: 'ICICI FD 15-18 Months',      minTenure: 450,  maxTenure: 539,  interestRate: 7.25, seniorRate: 7.75, minAmount: 10000 },
  { bankName: 'ICICI Bank',            schemeName: 'ICICI FD 2-5 Years',         minTenure: 730,  maxTenure: 1825, interestRate: 7.00, seniorRate: 7.50, minAmount: 10000 },
  { bankName: 'Axis Bank',             schemeName: 'Axis FD 1 Year',             minTenure: 365,  maxTenure: 395,  interestRate: 6.70, seniorRate: 7.20, minAmount: 5000 },
  { bankName: 'Axis Bank',             schemeName: 'Axis FD 15 Months-2 Years',  minTenure: 450,  maxTenure: 729,  interestRate: 7.10, seniorRate: 7.60, minAmount: 5000 },
  { bankName: 'Axis Bank',             schemeName: 'Axis Tax Saver FD',          minTenure: 1825, maxTenure: 1825, interestRate: 7.00, seniorRate: 7.75, minAmount: 5000 },
  { bankName: 'Kotak Mahindra Bank',   schemeName: 'Kotak FD 1 Year',            minTenure: 365,  maxTenure: 729,  interestRate: 7.10, seniorRate: 7.60, minAmount: 5000 },
  { bankName: 'Kotak Mahindra Bank',   schemeName: 'Kotak FD 390 Days',          minTenure: 390,  maxTenure: 390,  interestRate: 7.40, seniorRate: 7.90, minAmount: 5000 },
  { bankName: 'Punjab National Bank',  schemeName: 'PNB FD 1-2 Years',           minTenure: 365,  maxTenure: 729,  interestRate: 6.50, seniorRate: 7.00, minAmount: 1000 },
  { bankName: 'Punjab National Bank',  schemeName: 'PNB Uttam (400 Days)',        minTenure: 400,  maxTenure: 400,  interestRate: 7.25, seniorRate: 7.75, minAmount: 1000 },
  { bankName: 'Bank of Baroda',        schemeName: 'BOB FD 1 Year-400 Days',     minTenure: 365,  maxTenure: 400,  interestRate: 6.85, seniorRate: 7.35, minAmount: 1000 },
  { bankName: 'Bank of Baroda',        schemeName: 'BOB Bodhi 400 Days',         minTenure: 400,  maxTenure: 400,  interestRate: 7.05, seniorRate: 7.55, minAmount: 1000 },
  { bankName: 'Yes Bank',              schemeName: 'Yes Bank FD 1-18 Months',    minTenure: 365,  maxTenure: 540,  interestRate: 7.25, seniorRate: 7.75, minAmount: 10000 },
  { bankName: 'Yes Bank',              schemeName: 'Yes Bank FD 18M-3 Years',    minTenure: 541,  maxTenure: 1095, interestRate: 7.50, seniorRate: 8.00, minAmount: 10000 },
  { bankName: 'IndusInd Bank',         schemeName: 'IndusInd FD 1-2 Years',      minTenure: 365,  maxTenure: 729,  interestRate: 7.50, seniorRate: 8.00, minAmount: 10000 },
  { bankName: 'IndusInd Bank',         schemeName: 'IndusInd FD 2-5 Years',      minTenure: 730,  maxTenure: 1825, interestRate: 7.25, seniorRate: 7.75, minAmount: 10000 },
  { bankName: 'IDFC First Bank',       schemeName: 'IDFC FD 1 Year-500 Days',    minTenure: 365,  maxTenure: 500,  interestRate: 7.25, seniorRate: 7.75, minAmount: 10000 },
  { bankName: 'IDFC First Bank',       schemeName: 'IDFC FD 500 Days Special',   minTenure: 500,  maxTenure: 500,  interestRate: 7.75, seniorRate: 8.25, minAmount: 10000 },
  { bankName: 'Canara Bank',           schemeName: 'Canara FD 1 Year',           minTenure: 365,  maxTenure: 365,  interestRate: 6.85, seniorRate: 7.35, minAmount: 1000 },
  { bankName: 'Canara Bank',           schemeName: 'Canara Tax Saver FD',        minTenure: 1825, maxTenure: 1825, interestRate: 6.70, seniorRate: 7.20, minAmount: 1000 },
  { bankName: 'AU Small Finance Bank', schemeName: 'AU Bank FD 1 Year',          minTenure: 365,  maxTenure: 730,  interestRate: 7.25, seniorRate: 7.75, minAmount: 1000 },
  { bankName: 'RBL Bank',              schemeName: 'RBL FD 1 Year',              minTenure: 365,  maxTenure: 730,  interestRate: 7.50, seniorRate: 8.00, minAmount: 1000 },
  { bankName: 'Federal Bank',          schemeName: 'Federal Bank FD 1 Year',     minTenure: 365,  maxTenure: 730,  interestRate: 7.10, seniorRate: 7.60, minAmount: 1000 },
  { bankName: 'Union Bank of India',   schemeName: 'Union Bank FD 1 Year',       minTenure: 365,  maxTenure: 730,  interestRate: 6.70, seniorRate: 7.20, minAmount: 1000 },
];

// ── Smart Merge ────────────────────────────────────────────────────────────────

/**
 * Merge FD fallback with RBI deposit rates + live FD data.
 *
 * KEY FIX: RBI bank name normalization
 *   RBI publishes names like "HDFC Bank Ltd.", "State Bank of India", "Axis Bk."
 *   We canonicalBankName() AND slugify() on BOTH sides so they always match.
 *
 * KEY FIX: No threshold on RBI updates — any valid RBI rate is applied.
 *
 * KEY FIX: Bank-level RBI match works across ALL tenures for a given bank.
 *   Strategy: for each RBI bank, update ALL ~1-year tenure FDs (300–730 days).
 *
 * @param {Object[]} fallback    Tier 3 base FDs
 * @param {Object[]} rbiRates    Tier 1 RBI deposit rates [{bankName, rate, rateType}]
 * @param {Object[]} liveFDs     Tier 2 live FDs
 * @returns {{ merged, tier1Count, tier2Count, fallbackCount, newBanks }}
 */
function smartMergeFDs(fallback, rbiRates, liveFDs) {
  // ── Build primary map: bankSlug|tenureBucket → fd record ──────────────────
  const fdMap = new Map();
  for (const fd of fallback) {
    const bankKey   = slugify(canonicalBankName(fd.bankName));
    const tenBucket = Math.round((fd.minTenure || 365) / 90) * 90;
    const key       = `${bankKey}|${tenBucket}`;
    fdMap.set(key, { ...fd });
  }

  // ── Build reverse index: bankSlug → Set of fdMap keys for that bank ───────
  // Used so RBI can update ALL relevant records for a bank
  const bankToKeys = new Map(); // bankSlug → Set<mapKey>
  for (const [mapKey, fd] of fdMap) {
    const bankKey = slugify(canonicalBankName(fd.bankName));
    if (!bankToKeys.has(bankKey)) bankToKeys.set(bankKey, new Set());
    bankToKeys.get(bankKey).add(mapKey);
  }

  let tier1Count = 0;
  let tier2Count = 0;
  const newBanks = [];
  const rbiMatchLog = []; // for debug logging

  // ── Apply Tier 1 (RBI deposit rates) ──────────────────────────────────────
  // For each RBI deposit rate:
  //   1. Normalize the RBI bank name using canonicalBankName (handles "Ltd.", "Bk." etc.)
  //   2. Slugify the normalized name
  //   3. Find ALL fallback FD records for that bank with ~1-year tenure (270–730 days)
  //   4. Update ALL of them (no threshold — any valid RBI rate wins)
  for (const r of rbiRates) {
    if (r.rateType !== 'deposit') continue;
    if (!r.rate || r.rate <= 0) continue;

    // CRITICAL FIX: normalize RBI bank name before slugifying
    const normalizedRbiBankName = canonicalBankName(r.bankName);
    const rbiSlug               = slugify(normalizedRbiBankName);

    if (!rbiSlug) continue;

    const keysForBank = bankToKeys.get(rbiSlug);
    if (!keysForBank || keysForBank.size === 0) {
      // No matching fallback bank found
      rbiMatchLog.push(`  ⚠️  [RBI FD] No fallback match for: "${r.bankName}" → "${normalizedRbiBankName}" (slug: ${rbiSlug})`);
      continue;
    }

    let updatedCount = 0;
    for (const fdKey of keysForBank) {
      const fd = fdMap.get(fdKey);
      if (!fd) continue;

      // Only update ~1-year tenure FDs (270–730 days) — most relevant for RBI deposit benchmarks
      if (fd.minTenure < 270 || fd.minTenure > 730) continue;

      const oldRate = fd.interestRate;
      fd.interestRate      = r.rate;
      fd.seniorRate        = Math.round((r.rate + 0.5) * 100) / 100;
      fd._updatedByTier1   = true;
      fdMap.set(fdKey, fd);
      updatedCount++;
      tier1Count++;
      rbiMatchLog.push(`  ✅ [RBI FD] Updated "${fd.schemeName}" (${fd.bankName}): ${oldRate}% → ${r.rate}% (RBI name: "${r.bankName}")`);
    }

    if (updatedCount === 0) {
      rbiMatchLog.push(`  ⚠️  [RBI FD] "${normalizedRbiBankName}" matched but no 1-yr tenure FD to update`);
    }
  }

  // ── Apply Tier 2 (live FDs) ────────────────────────────────────────────────
  for (const liveFD of liveFDs) {
    const bankKey   = slugify(canonicalBankName(liveFD.bankName));
    const tenBucket = Math.round((liveFD.minTenure || 365) / 90) * 90;
    const key       = `${bankKey}|${tenBucket}`;

    if (fdMap.has(key)) {
      const existing = fdMap.get(key);
      if (liveFD.interestRate > 0) {
        existing.interestRate    = liveFD.interestRate;
        existing.seniorRate      = liveFD.seniorRate || (liveFD.interestRate + 0.5);
        existing.minAmount       = liveFD.minAmount || existing.minAmount;
        existing.lastUpdatedDate = liveFD.lastUpdatedDate || new Date().toISOString().split('T')[0];
        existing._updatedByTier2 = true;
        tier2Count++;
      }
    } else {
      // New FD not in fallback
      fdMap.set(key, {
        bankName:     canonicalBankName(liveFD.bankName),
        schemeName:   liveFD.schemeName || `${canonicalBankName(liveFD.bankName)} FD`,
        minTenure:    liveFD.minTenure || 365,
        maxTenure:    liveFD.maxTenure || 365,
        interestRate: liveFD.interestRate,
        seniorRate:   liveFD.seniorRate || (liveFD.interestRate + 0.5),
        minAmount:    liveFD.minAmount || 1000,
        _fromTier2:   true,
      });
      newBanks.push(canonicalBankName(liveFD.bankName));
      tier2Count++;
    }
  }

  // Print RBI match log
  if (rbiMatchLog.length > 0) {
    console.log('[FD Scraper] 📊 RBI Rate Match Details:');
    rbiMatchLog.forEach(l => console.log(l));
  }

  const merged       = Array.from(fdMap.values()).filter(f => f.interestRate > 0);
  const fallbackCount = Math.max(0, FALLBACK_FDS.length - tier1Count - tier2Count);

  return {
    merged,
    tier1Count,
    tier2Count,
    fallbackCount,
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
 * Full 3-tier FD scrape + DB upsert.
 *
 * @param {{ Bank, FixedDeposit, ScraperLog, sequelize }} modelBag
 * @returns {Promise<{ section, recordsUpdated, status, tierBreakdown }>}
 */
async function runFDScraper({ Bank, FixedDeposit, ScraperLog, sequelize }) {
  const startTime = Date.now();
  console.log('\n[FD Scraper] ══ 3-Tier Run Starting ══');

  // ── TIER 3: Fallback ──────────────────────────────────────────────────────
  console.log(`[FD Scraper] 📦 Tier 3 (Fallback): ${FALLBACK_FDS.length} FD records loaded`);

  // ── TIER 1: RBI Deposit Rates ─────────────────────────────────────────────
  let rbiResult = { data: [], count: 0, usedFallback: true };
  try {
    console.log('[FD Scraper] 📊 Tier 1 (RBI): fetching deposit rates...');
    rbiResult = await scrapeRBI();
    const depositRates = rbiResult.data.filter(r => r.rateType === 'deposit');
    if (depositRates.length > 0) {
      console.log(`  ✅ [FD] RBI deposit rates: ${depositRates.length} records for ${new Set(depositRates.map(r => r.bankName)).size} banks`);
    } else {
      console.log('  ⚠️  [FD] RBI returned 0 deposit rates — continuing without Tier 1');
    }
  } catch (err) {
    console.log(`  ❌ [FD] Tier 1 (RBI) failed: ${err.message}`);
  }

  // ── TIER 2: Live FD Scrapers ───────────────────────────────────────────────
  let tier2Result = { fds: [], count: 0, sourceBreakdown: {}, errors: [] };
  try {
    console.log('[FD Scraper] 🌐 Tier 2 (Live Aggregators): fetching...');
    tier2Result = await scrapeFDSourcesLive();
    console.log(`[FD Scraper] Tier 2 total: ${tier2Result.count} FD records`);
    if (tier2Result.sourceBreakdown) {
      for (const [src, cnt] of Object.entries(tier2Result.sourceBreakdown)) {
        console.log(`            └─ ${src}: ${cnt}`);
      }
    }
  } catch (err) {
    console.log(`[FD Scraper] ❌ Tier 2 entirely failed: ${err.message}`);
  }

  // ── SMART MERGE ────────────────────────────────────────────────────────────
  const { merged, tier1Count, tier2Count, fallbackCount, newBanks } = smartMergeFDs(
    FALLBACK_FDS,
    rbiResult.data,
    tier2Result.fds,
  );

  console.log(`[FD Scraper] 🔀 Merge result: ${merged.length} FD records`);
  console.log(`            ├─ Tier 1 (RBI rate updates):  ${tier1Count}`);
  console.log(`            ├─ Tier 2 (live updates):      ${tier2Count}`);
  console.log(`            ├─ Fallback only:              ${fallbackCount}`);
  console.log(`            └─ New banks from Tier 2:      ${newBanks.length > 0 ? newBanks.join(', ') : 'none'}`);

  if (merged.length === 0) {
    await _logRun(ScraperLog, 'fixed_deposits', 0, 'failed', 'No data from any tier');
    return { section: 'fixed_deposits', recordsUpdated: 0, status: 'failed' };
  }

  // ── DB UPSERT ─────────────────────────────────────────────────────────────
  let recordsUpdated = 0;
  const errors = [];
  const t = await sequelize.transaction();

  try {
    for (const fd of merged) {
      try {
        const bankName = canonicalBankName(fd.bankName);
        const [bank] = await Bank.findOrCreate({
          where:    { name: bankName },
          defaults: { name: bankName, bank_type: guessBankType(bankName), is_active: true },
          transaction: t,
        });

        const payload = {
          bank_id:               bank.id,
          scheme_name:           fd.schemeName || `${bankName} FD`,
          interest_rate:         fd.interestRate ?? 6.5,
          senior_citizen_rate:   fd.seniorRate ?? (fd.interestRate + 0.5),
          min_tenure:            fd.minTenure ?? 365,
          max_tenure:            fd.maxTenure ?? 365,
          min_amount:            fd.minAmount ?? 1000,
          compounding_frequency: 'quarterly',
          premature_withdrawal:  true,
          loan_against_fd:       true,
          is_active:             true,
          last_updated:          new Date(),
        };

        const existing = await FixedDeposit.findOne({
          where: { bank_id: bank.id, scheme_name: payload.scheme_name },
          transaction: t,
        });

        if (existing) {
          await existing.update(payload, { transaction: t });
        } else {
          await FixedDeposit.create(payload, { transaction: t });
        }
        recordsUpdated++;
      } catch (rowErr) {
        errors.push(`${fd.bankName}/${fd.schemeName}: ${rowErr.message}`);
      }
    }

    await t.commit();

    const status       = errors.length === 0 ? 'success' : 'partial';
    const elapsed      = ((Date.now() - startTime) / 1000).toFixed(1);
    const tierBreakdown = { tier1_count: tier1Count, tier2_count: tier2Count, fallback_count: fallbackCount, total: recordsUpdated };

    await _logRun(ScraperLog, 'fixed_deposits', recordsUpdated, status, errors.slice(0, 5).join('; ') || null);
    console.log(`[FD Scraper] ✅ Done — ${recordsUpdated} records in ${elapsed}s`);
    if (errors.length) console.log(`[FD Scraper] ⚠️  ${errors.length} row errors`);

    return { section: 'fixed_deposits', recordsUpdated, status, tierBreakdown };

  } catch (err) {
    await t.rollback();
    console.error('[FD Scraper] ❌ Transaction failed:', err.message);
    await _logRun(ScraperLog, 'fixed_deposits', 0, 'failed', err.message);
    throw err;
  }
}

module.exports = { runFDScraper };
