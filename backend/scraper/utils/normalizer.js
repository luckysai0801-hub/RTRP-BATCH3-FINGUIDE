/**
 * scraper/utils/normalizer.js
 * Transforms any RawCard (from any source parser) into the
 * canonical NormalizedCard schema that maps 1-to-1 with
 * the CreditCard Sequelize model.
 *
 * Also handles deduplication across all sources using a
 * composite key of  slugify(bankName) + "|" + slugify(cardName).
 */

'use strict';

const { slugify } = require('./parsers');

/**
 * Known bank name aliases → canonical name.
 * Add more as needed.
 */
const BANK_ALIASES = {
  // ── HDFC ──────────────────────────────────────────────────────────────────
  'hdfc':                          'HDFC Bank',
  'hdfc bank':                     'HDFC Bank',
  'hdfc bank ltd':                 'HDFC Bank',
  // ── SBI ───────────────────────────────────────────────────────────────────
  'state bank of india':           'State Bank of India',
  'sbi':                           'State Bank of India',
  'sbi card':                      'State Bank of India',
  'sbicards':                      'State Bank of India',
  'sbi cards':                     'State Bank of India',
  // ── ICICI ─────────────────────────────────────────────────────────────────
  'icici':                         'ICICI Bank',
  'icici bank':                    'ICICI Bank',
  'icici bank ltd':                'ICICI Bank',
  // ── Axis ──────────────────────────────────────────────────────────────────
  'axis':                          'Axis Bank',
  'axis bank':                     'Axis Bank',
  'axis bank ltd':                 'Axis Bank',
  // ── Kotak ─────────────────────────────────────────────────────────────────
  'kotak':                         'Kotak Mahindra Bank',
  'kotak mahindra':                'Kotak Mahindra Bank',
  'kotak mahindra bank':           'Kotak Mahindra Bank',
  'kotak bank':                    'Kotak Mahindra Bank',
  // ── PNB ───────────────────────────────────────────────────────────────────
  'pnb':                           'Punjab National Bank',
  'punjab national bank':          'Punjab National Bank',
  'punjab national':               'Punjab National Bank',
  // ── Bank of Baroda ────────────────────────────────────────────────────────
  'bob':                           'Bank of Baroda',
  'bank of baroda':                'Bank of Baroda',
  // ── Yes Bank ──────────────────────────────────────────────────────────────
  'yes bank':                      'Yes Bank',
  'yes':                           'Yes Bank',
  // ── IndusInd ──────────────────────────────────────────────────────────────
  'indusind bank':                 'IndusInd Bank',
  'indusind':                      'IndusInd Bank',
  'induslnd bank':                 'IndusInd Bank',  // common typo
  // ── IDFC First ────────────────────────────────────────────────────────────
  'idfc':                          'IDFC First Bank',
  'idfc first':                    'IDFC First Bank',
  'idfc first bank':               'IDFC First Bank',
  'idfc bank':                     'IDFC First Bank',
  // ── AU Small Finance ──────────────────────────────────────────────────────
  'au':                            'AU Small Finance Bank',
  'au small finance bank':         'AU Small Finance Bank',
  'au bank':                       'AU Small Finance Bank',
  'au small finance':              'AU Small Finance Bank',
  // ── Canara ────────────────────────────────────────────────────────────────
  'canara':                        'Canara Bank',
  'canara bank':                   'Canara Bank',
  // ── RBL ───────────────────────────────────────────────────────────────────
  'rbl bank':                      'RBL Bank',
  'rbl':                           'RBL Bank',
  'ratnakar bank':                 'RBL Bank',
  // ── Federal Bank ──────────────────────────────────────────────────────────
  'federal bank':                  'Federal Bank',
  'the federal bank':              'Federal Bank',
  // ── Standard Chartered ────────────────────────────────────────────────────
  'standard chartered':            'Standard Chartered',
  'standard chartered bank':       'Standard Chartered',
  'sc bank':                       'Standard Chartered',
  'stanchart':                     'Standard Chartered',
  // ── HSBC ──────────────────────────────────────────────────────────────────
  'hsbc':                          'HSBC Bank',
  'hsbc bank':                     'HSBC Bank',
  'hsbc india':                    'HSBC Bank',
  // ── American Express ──────────────────────────────────────────────────────
  'american express':              'American Express',
  'amex':                          'American Express',
  'americanexpress':               'American Express',
  // ── Union Bank ────────────────────────────────────────────────────────────
  'union bank of india':           'Union Bank of India',
  'union bank':                    'Union Bank of India',
  'ubi':                           'Union Bank of India',
  // ── Other public banks ────────────────────────────────────────────────────
  'bank of india':                 'Bank of India',
  'central bank of india':         'Central Bank of India',
  'central bank':                  'Central Bank of India',
  'indian bank':                   'Indian Bank',
  'uco bank':                      'UCO Bank',
  'bank of maharashtra':           'Bank of Maharashtra',
  // ── Other private banks ───────────────────────────────────────────────────
  'bandhan bank':                  'Bandhan Bank',
  'karur vysya bank':              'Karur Vysya Bank',
  'kvb':                           'Karur Vysya Bank',
  'south indian bank':             'South Indian Bank',
  'city union bank':               'City Union Bank',
  'cub':                           'City Union Bank',
  'dcb bank':                      'DCB Bank',
  'jammu and kashmir bank':        'Jammu and Kashmir Bank',
  'j&k bank':                      'Jammu and Kashmir Bank',
  'tamilnad mercantile bank':      'Tamilnad Mercantile Bank',
  'saraswat bank':                 'Saraswat Bank',
};

function canonicalBankName(raw) {
  const key = (raw || '').toLowerCase().trim();
  return BANK_ALIASES[key] || raw || 'Unknown Bank';
}

/**
 * Best-guess rewards type from a description string.
 */
function guessRewardsType(desc, cashback) {
  if (!desc) return cashback > 0 ? 'cashback' : 'general';
  const d = desc.toLowerCase();
  if (/cashback/i.test(d)) return 'cashback';
  if (/travel|lounge|miles|airport/i.test(d)) return 'travel';
  if (/shopping|amazon|flipkart/i.test(d)) return 'shopping';
  if (/fuel|petrol/i.test(d)) return 'fuel';
  if (/dining|restaurant|food/i.test(d)) return 'dining';
  return 'general';
}

/**
 * Normalise a single raw card into the canonical schema.
 * @param {Object} raw  Raw card from any source parser
 * @returns {Object}    Normalised card ready for DB upsert
 */
function normalizeCard(raw) {
  const bankName = canonicalBankName(raw.bankName || raw.bank_name || '');
  const cardName = (raw.cardName || raw.card_name || '').trim();
  const annualFee = typeof raw.annualFee === 'number' ? raw.annualFee : (raw.annual_fee ?? 0);
  const joiningFee = typeof raw.joiningFee === 'number' ? raw.joiningFee : (raw.joining_fee ?? annualFee);
  const interestRate = raw.interestRate ?? raw.interest_rate ?? 36.0;
  const cashback = raw.cashback ?? 0;
  const lounge = raw.lounge ?? raw.lounge_access ?? false;
  const network = normalizeNetwork(raw.network);
  const rewardsType = raw.rewardsType ?? raw.rewards_type
    ?? guessRewardsType(raw.rewardsDescription || raw.rewards_description, cashback);
  const rewardsDescription = raw.rewardsDescription || raw.rewards_description || '';
  const applyUrl = raw.applyUrl || raw.apply_url || '';
  const source = raw.source || 'fallback';

  return {
    bankName,
    card_name: cardName,
    annual_fee: annualFee,
    joining_fee: joiningFee,
    interest_rate: Number(interestRate),
    cashback: Number(cashback),
    rewards_type: rewardsType,
    rewards_description: rewardsDescription,
    lounge_access: Boolean(lounge),
    network,
    apply_url: applyUrl,
    is_active: true,
    last_updated: new Date(),
    _source: source,
    _dedupeKey: `${slugify(bankName)}|${slugify(cardName)}`,
  };
}

function normalizeNetwork(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s.includes('visa'))   return 'Visa';
  if (s.includes('master')) return 'Mastercard';
  if (s.includes('rupay') || s.includes('ru pay')) return 'Rupay';
  if (s.includes('amex') || s.includes('american express')) return 'Amex';
  if (s.includes('diners')) return 'Diners';
  return null;
}

/**
 * Deduplicate an array of normalised cards.
 * When the same card appears from multiple sources, the entry
 * from the most-authoritative source wins (official bank > aggregator).
 *
 * Source priority (lower index = higher priority):
 */
const SOURCE_PRIORITY = [
  'hdfc_official', 'sbicard_official', 'icici_official',
  'axis_official', 'idfc_official', 'au_official',
  'bankbazaar', 'paisabazaar', 'cardinsider',
  'fallback',
];

function sourcePriority(source) {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

/**
 * Deduplicate an array of normalised cards.
 * @param {Object[]} cards
 * @returns {Object[]}
 */
function deduplicateCards(cards) {
  const seen = new Map();

  for (const card of cards) {
    const key = card._dedupeKey;
    if (!key || key === '|') continue; // skip cards with no identity

    if (!seen.has(key)) {
      seen.set(key, card);
    } else {
      // Keep the higher-priority (more authoritative) version
      const existing = seen.get(key);
      if (sourcePriority(card._source) < sourcePriority(existing._source)) {
        // Merge: prefer authoritative card but fill in any missing fields
        seen.set(key, { ...existing, ...card });
      }
    }
  }

  return Array.from(seen.values());
}

module.exports = { normalizeCard, deduplicateCards, canonicalBankName };
