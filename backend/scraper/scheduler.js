/**
 * scraper/scheduler.js
 *
 * 3-Tier Weekly Cron Scheduler — runs every Sunday at 2 AM IST.
 * ══════════════════════════════════════════════════════════════════════
 * Always runs ALL 3 tiers for each scraper category:
 *   - Tier 1 (RBI public data)  via rbiScraper.js
 *   - Tier 2 (Live aggregators) via source scrapers
 *   - Tier 3 (Fallback JSON)    embedded in each scraper
 *
 * Behavior:
 *   - Tier 1 + Tier 2 both fail → Tier 3 (fallback) used silently
 *   - Tier 1 or Tier 2 partial  → merge whatever was scraped
 *   - ScraperLog records: tier1_count, tier2_count, fallback_count, total
 * ══════════════════════════════════════════════════════════════════════
 */

'use strict';

const cron = require('node-cron');
const { sequelize }     = require('../config/database');
const { Bank, CreditCard, Loan, FixedDeposit, ScraperLog } = require('../models');
const { runCreditCardScraper } = require('./scrapers/creditCardScraper');
const { runLoanScraper }       = require('./scrapers/loanScraper');
const { runFDScraper }         = require('./scrapers/fdScraper');

// Shared model bag
const modelBag = { sequelize, Bank, CreditCard, Loan, FixedDeposit, ScraperLog };

// ── Main Orchestrator ──────────────────────────────────────────────────────────

/**
 * Runs all three scrapers (each with internal 3-tier logic) sequentially.
 * Returns a summary object for API responses.
 */
async function runAllScrapers() {
  if (!sequelize) {
    console.warn('[Scheduler] DB not connected — skipping scraper run');
    return {
      success:           false,
      message:          'Database not connected',
      sections_updated: [],
      timestamp:        new Date().toISOString(),
    };
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 FinGuide 3-Tier Weekly Scraper — Starting Run');
  console.log(`⏰ Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results    = [];
  const startedAt  = Date.now();
  const allTierTotals = { tier1_count: 0, tier2_count: 0, fallback_count: 0, total: 0 };

  // ── 1) Credit Cards ──────────────────────────────────────────────────────────
  console.log('▶ Running Credit Card Scraper (Tier 1+2+3)...');
  try {
    const res = await runCreditCardScraper(modelBag);
    results.push(res);
    accumulateTiers(allTierTotals, res.tierBreakdown);
    console.log(`✅ Credit Cards: ${res.recordsUpdated} records [${res.status}]`);
  } catch (err) {
    console.error('[Scheduler] Credit card scraper threw:', err.message);
    results.push({ section: 'credit_cards', recordsUpdated: 0, status: 'failed' });
  }

  // ── 2) Loans ─────────────────────────────────────────────────────────────────
  console.log('\n▶ Running Loan Scraper (Tier 1+2+3)...');
  try {
    const res = await runLoanScraper(modelBag);
    results.push(res);
    accumulateTiers(allTierTotals, res.tierBreakdown);
    console.log(`✅ Loans: ${res.recordsUpdated} records [${res.status}]`);
  } catch (err) {
    console.error('[Scheduler] Loan scraper threw:', err.message);
    results.push({ section: 'loans', recordsUpdated: 0, status: 'failed' });
  }

  // ── 3) Fixed Deposits ─────────────────────────────────────────────────────────
  console.log('\n▶ Running FD Scraper (Tier 1+2+3)...');
  try {
    const res = await runFDScraper(modelBag);
    results.push(res);
    accumulateTiers(allTierTotals, res.tierBreakdown);
    console.log(`✅ Fixed Deposits: ${res.recordsUpdated} records [${res.status}]`);
  } catch (err) {
    console.error('[Scheduler] FD scraper threw:', err.message);
    results.push({ section: 'fixed_deposits', recordsUpdated: 0, status: 'failed' });
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const elapsed      = ((Date.now() - startedAt) / 1000).toFixed(1);
  const totalUpdated = results.reduce((s, r) => s + (r.recordsUpdated || 0), 0);
  const overallSuccess = results.some(r => r.status !== 'failed');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Scraper run complete — ${totalUpdated} total records in ${elapsed}s`);
  console.log(`   Tier breakdown:`);
  console.log(`   ├─ Tier 1 (RBI):       ${allTierTotals.tier1_count}`);
  console.log(`   ├─ Tier 2 (Live):      ${allTierTotals.tier2_count}`);
  console.log(`   └─ Tier 3 (Fallback):  ${allTierTotals.fallback_count}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Write overall run to ScraperLog
  if (ScraperLog) {
    const failedSections = results.filter(r => r.status === 'failed').map(r => r.section);
    await ScraperLog.create({
      section:         'all',
      records_updated: totalUpdated,
      status:          overallSuccess ? (failedSections.length > 0 ? 'partial' : 'success') : 'failed',
      error_message:   failedSections.length > 0 ? `Failed: ${failedSections.join(', ')}` : null,
      run_at:          new Date(),
    }).catch(e => console.warn('[Scheduler] Failed to write overall log:', e.message));
  }

  return {
    success:          overallSuccess,
    sections_updated: results,
    total_records:    totalUpdated,
    elapsed_seconds:  parseFloat(elapsed),
    tier_breakdown:   allTierTotals,
    timestamp:        new Date().toISOString(),
  };
}

// ── Utility: accumulate tier counts ───────────────────────────────────────────

function accumulateTiers(totals, breakdown) {
  if (!breakdown) return;
  totals.tier1_count    += breakdown.tier1_count    || 0;
  totals.tier2_count    += breakdown.tier2_count    || 0;
  totals.fallback_count += breakdown.fallback_count || 0;
  totals.total          += breakdown.total          || 0;
}

// ── Cron Job ──────────────────────────────────────────────────────────────────

/**
 * Starts the cron job.
 * Schedule: "0 2 * * 0" = every Sunday at 02:00 AM
 * Timezone: Asia/Kolkata (IST)
 */
function startScheduler() {
  if (!sequelize) {
    console.warn('[Scheduler] DB not ready — cron will NOT be registered');
    return;
  }

  // Every Sunday at 2:00 AM IST
  cron.schedule('0 2 * * 0', async () => {
    console.log(`[Scheduler] ⏰ Cron triggered at ${new Date().toISOString()}`);
    try {
      await runAllScrapers();
    } catch (err) {
      console.error('[Scheduler] Unhandled error in scraper run:', err);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  console.log('📅 [Scheduler] 3-Tier weekly scraper scheduled — every Sunday at 02:00 AM IST');
}

module.exports = { startScheduler, runAllScrapers };
