/**
 * scraper/scrapers/creditCardScraper.js  — 3-TIER ARCHITECTURE
 *
 * ══════════════════════════════════════════════════════════════════════
 * Pipeline:
 *   Tier 3 (Fallback) — fallbackCards.json    → guaranteed base
 *   Tier 1 (RBI)      — rbiScraper.js         → lending rates overlay
 *   Tier 2 (Live)     — cardScraperLive.js    → additional live cards
 *
 * smartMerge:
 *   1. Start with Tier 3 as base (50 curated cards)
 *   2. Any card found in Tier 2 with same bank+name → update fees/cashback
 *   3. Add new unique cards from Tier 2 not in fallback
 *   4. Deduplicate by bankName|cardName slug
 *   5. Log tier breakdown to ScraperLog
 * ══════════════════════════════════════════════════════════════════════
 */

'use strict';

const { normalizeCard, deduplicateCards } = require('../utils/normalizer');
const { slugify } = require('../utils/parsers');
const FALLBACK_CARDS = require('../data/fallbackCards.json');
const { scrapeCardSourcesLive } = require('../sources/cardScraperLive');

// ── Bank Type Helper ───────────────────────────────────────────────────────────

function guessBankType(bankName) {
  const PUBLIC_KEYWORDS = [
    'State Bank', 'Punjab National', 'Bank of Baroda',
    'Canara', 'Union Bank', 'Bank of India', 'Central Bank',
    'Indian Bank', 'UCO Bank', 'Bank of Maharashtra',
  ];
  return PUBLIC_KEYWORDS.some(k => bankName.includes(k)) ? 'public' : 'private';
}

// ── Smart Merge ────────────────────────────────────────────────────────────────

/**
 * Merge fallback cards with live cards using update-on-match strategy.
 *
 * @param {Object[]} fallback   Tier 3 — normalized fallback cards
 * @param {Object[]} live       Tier 2 — normalized live cards
 * @returns {{ merged: Object[], tier2Count: number, fallbackCount: number, newBanks: string[] }}
 */
function smartMergeCards(fallback, live) {
  // Build lookup map of fallback by dedupe key
  const fallbackMap = new Map();
  for (const card of fallback) {
    const key = `${slugify(card.bankName)}|${slugify(card.card_name)}`;
    fallbackMap.set(key, card);
  }

  let tier2Count    = 0;
  const newBanks    = [];
  const updatedKeys = new Set();

  // Process live cards
  for (const liveCard of live) {
    const key = `${slugify(liveCard.bankName)}|${slugify(liveCard.card_name || liveCard.cardName || '')}`;
    if (fallbackMap.has(key)) {
      // Update existing fallback record with live fees/cashback if non-zero
      const existing = fallbackMap.get(key);
      const updated  = { ...existing };
      if (liveCard.annual_fee  > 0) updated.annual_fee  = liveCard.annual_fee;
      if (liveCard.joining_fee > 0) updated.joining_fee = liveCard.joining_fee;
      if (liveCard.cashback    > 0) updated.cashback    = liveCard.cashback;
      if (liveCard.network)          updated.network    = liveCard.network;
      updated._source = 'tier2_updated';
      fallbackMap.set(key, updated);
      updatedKeys.add(key);
      tier2Count++;
    } else {
      // New card not in fallback → add it
      fallbackMap.set(key, { ...liveCard, _source: 'tier2_new' });
      newBanks.push(liveCard.bankName);
      tier2Count++;
    }
  }

  const merged       = Array.from(fallbackMap.values());
  const fallbackCount = fallback.length - updatedKeys.size;

  return { merged, tier2Count, fallbackCount, newBanks: [...new Set(newBanks)] };
}

// ── Log Helper ─────────────────────────────────────────────────────────────────

async function _logRun(ScraperLog, section, records, status, errorMsg, meta) {
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
 * Full 3-tier credit card scrape + DB upsert.
 *
 * @param {{ Bank, CreditCard, ScraperLog, sequelize }} modelBag
 * @returns {Promise<{ section, recordsUpdated, status, tierBreakdown }>}
 */
async function runCreditCardScraper({ Bank, CreditCard, ScraperLog, sequelize }) {
  const startTime = Date.now();
  console.log('\n[CreditCard Scraper] ══ 3-Tier Run Starting ══');

  // ── TIER 3: Fallback (base) ─────────────────────────────────────────────────
  const tier3Cards = FALLBACK_CARDS
    .map(c => { try { return normalizeCard(c); } catch { return null; } })
    .filter(Boolean)
    .filter(c => c.card_name && c.card_name.length >= 3);

  console.log(`[CreditCard] 📦 Tier 3 (Fallback): ${tier3Cards.length} curated cards loaded`);

  // ── TIER 2: Live Aggregators ────────────────────────────────────────────────
  let tier2Result  = { cards: [], count: 0, sourceBreakdown: {}, errors: [] };
  let tier2Normalized = [];
  try {
    console.log('[CreditCard] 🌐 Tier 2 (Live Aggregators): fetching...');
    tier2Result = await scrapeCardSourcesLive();
    tier2Normalized = tier2Result.cards
      .map(c => {
        try {
          return normalizeCard({
            ...c,
            cardName: c.cardName || c.card_name || '',
            source:   c.source || 'tier2',
          });
        } catch { return null; }
      })
      .filter(Boolean)
      .filter(c => c.card_name && c.card_name.length >= 3);

    console.log(`[CreditCard] Tier 2 total valid: ${tier2Normalized.length}`);
    if (tier2Result.sourceBreakdown) {
      for (const [src, cnt] of Object.entries(tier2Result.sourceBreakdown)) {
        console.log(`            └─ ${src}: ${cnt}`);
      }
    }
  } catch (err) {
    console.log(`[CreditCard] ❌ Tier 2 entirely failed: ${err.message} — using fallback only`);
  }

  // ── TIER 1: RBI Rates (credit cards — use for interest rate context only) ──
  // RBI data is primarily for loans/FDs; for cards we just log that tier1 ran
  const tier1Count = 0; // RBI doesn't publish credit card rates directly
  console.log(`[CreditCard] 📊 Tier 1 (RBI): N/A for credit cards — skipped`);

  // ── SMART MERGE ─────────────────────────────────────────────────────────────
  const { merged, tier2Count, fallbackCount, newBanks } = smartMergeCards(tier3Cards, tier2Normalized);
  const allCards = deduplicateCards(merged);

  console.log(`[CreditCard] 🔀 Merge result: ${allCards.length} unique cards`);
  console.log(`            ├─ Tier 3 (fallback base): ${fallbackCount}`);
  console.log(`            ├─ Tier 2 (live updates):  ${tier2Count}`);
  console.log(`            └─ New banks from Tier 2:  ${newBanks.length > 0 ? newBanks.join(', ') : 'none'}`);

  if (allCards.length === 0) {
    await _logRun(ScraperLog, 'credit_cards', 0, 'failed', 'No data from any tier');
    return { section: 'credit_cards', recordsUpdated: 0, status: 'failed' };
  }

  // ── DB UPSERT ────────────────────────────────────────────────────────────────
  let recordsUpdated = 0;
  const errors = [];
  const t = await sequelize.transaction();

  try {
    for (const card of allCards) {
      try {
        const [bankRecord] = await Bank.findOrCreate({
          where:    { name: card.bankName },
          defaults: { name: card.bankName, bank_type: guessBankType(card.bankName), is_active: true },
          transaction: t,
        });

        const cardData = {
          bank_id:               bankRecord.id,
          card_name:             card.card_name,
          annual_fee:            card.annual_fee,
          joining_fee:           card.joining_fee,
          interest_rate:         card.interest_rate,
          cashback:              card.cashback,
          rewards_type:          card.rewards_type,
          rewards_description:   card.rewards_description,
          lounge_access:         card.lounge_access,
          fuel_surcharge_waiver: card.fuel_surcharge_waiver ?? false,
          network:               card.network,
          apply_url:             card.apply_url,
          is_active:             true,
          last_updated:          new Date(),
        };

        const existing = await CreditCard.findOne({
          where: { bank_id: bankRecord.id, card_name: cardData.card_name },
          transaction: t,
        });

        if (existing) {
          await existing.update(cardData, { transaction: t });
        } else {
          await CreditCard.create(cardData, { transaction: t });
        }
        recordsUpdated++;
      } catch (rowErr) {
        errors.push(`${card.bankName}/${card.card_name}: ${rowErr.message}`);
      }
    }

    await t.commit();

    const status  = errors.length === 0 ? 'success' : 'partial';
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const tierBreakdown = {
      tier1_count:    tier1Count,
      tier2_count:    tier2Count,
      fallback_count: fallbackCount,
      total:          recordsUpdated,
    };

    await _logRun(ScraperLog, 'credit_cards', recordsUpdated, status,
      errors.slice(0, 5).join('; ') || null, tierBreakdown);

    console.log(`[CreditCard] ✅ Done — ${recordsUpdated} records in ${elapsed}s`);
    if (errors.length) console.log(`[CreditCard] ⚠️  ${errors.length} row errors`);

    return { section: 'credit_cards', recordsUpdated, status, tierBreakdown };

  } catch (err) {
    await t.rollback();
    console.error('[CreditCard] ❌ Transaction failed:', err.message);
    await _logRun(ScraperLog, 'credit_cards', 0, 'failed', err.message);
    throw err;
  }
}

// Backward-compat alias
async function scrapeAllSources() {
  const curated = FALLBACK_CARDS
    .map(c => { try { return normalizeCard(c); } catch { return null; } })
    .filter(Boolean);
  let live = [];
  try {
    const result = await scrapeCardSourcesLive();
    live = result.cards.map(c => { try { return normalizeCard(c); } catch { return null; } }).filter(Boolean);
  } catch (_) {}
  return deduplicateCards([...curated, ...live]);
}

module.exports = { runCreditCardScraper, scrapeAllSources };
