/**
 * scraper/sources/cardScraperLive.js (v3 — garbage data validation fix)
 *
 * TIER 2 — Live Credit Card Aggregator Scraper
 * ══════════════════════════════════════════════════════════════════════
 * CHANGES in v3:
 *   - Deal4Loans: added strict 4-rule validation guard before pushing
 *     any card to results, eliminating blog titles, guide pages, and
 *     non-card content that slipped through selector matches.
 *   - CardInsider: unchanged ✅ (working)
 *   - MyMoneyMantra: unchanged ✅
 * ══════════════════════════════════════════════════════════════════════
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const { canonicalBankName } = require('../utils/normalizer');
const { parseINR, parseRate, slugify } = require('../utils/parsers');

// ── User Agent Pool ────────────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
];

let _uaIndex = 0;
function nextUA() {
  const ua = USER_AGENTS[_uaIndex % USER_AGENTS.length];
  _uaIndex++;
  return ua;
}

// ── HTTP Helper ────────────────────────────────────────────────────────────────

async function fetchPageWithFallback(urlOrList, referer = 'https://www.google.co.in/', timeout = 15000) {
  const urls = Array.isArray(urlOrList) ? urlOrList : [urlOrList];
  let lastErr = null;

  for (const url of urls) {
    try {
      const { data, request } = await axios.get(url, {
        timeout,
        maxRedirects: 5,
        headers: {
          'User-Agent':      nextUA(),
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer':         referer,
          'Cache-Control':   'no-cache',
          'DNT':             '1',
        },
      });
      const finalUrl = (request && request.res && request.res.responseUrl) || url;
      return { data, finalUrl };
    } catch (err) {
      console.log(`    ↳ [fetch] ${url} → ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr || new Error('All URLs failed');
}

async function fetchPage(url, referer, timeout) {
  const { data } = await fetchPageWithFallback(url, referer, timeout);
  return data;
}

// ── HTML Debug Helper ──────────────────────────────────────────────────────────

function debugHtml(label, html, chars = 200) {
  const snippet = String(html || '').replace(/\s+/g, ' ').trim().slice(0, chars);
  console.log(`  🔍 [DEBUG ${label}] HTML snippet: ${snippet}`);
}

// ── Network Normalizer ─────────────────────────────────────────────────────────

function normalizeNetwork(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s.includes('visa'))               return 'Visa';
  if (s.includes('master'))             return 'Mastercard';
  if (s.includes('rupay') || s.includes('ru pay')) return 'Rupay';
  if (s.includes('amex') || s.includes('american express')) return 'Amex';
  if (s.includes('diners'))             return 'Diners';
  return null;
}

// ── Deal4Loans Card Validation ─────────────────────────────────────────────────
//
// Strict 4-rule guard that rejects blog posts, guides, and non-card content.
//
// RULE 1 — name must contain a known credit card keyword
const CARD_KEYWORDS = [
  'card', 'visa', 'master', 'rupay', 'platinum', 'gold', 'silver',
  'classic', 'premium', 'reward', 'cashback', 'miles', 'elite',
  'signature', 'infinite', 'select', 'plus', 'pro', 'lite',
];

// RULE 3 — name must NOT contain any of these strings
const CARD_REJECT_PHRASES = [
  'how to', 'what is', 'gold rate', 'silver rate',
  'emi calculator', 'loan against', ' review',
  'airport lounge', 'lounge access guide', 'apply for',
];

// RULE 4 — bank name must contain a known Indian bank/issuer
const KNOWN_BANKS = [
  'hdfc', 'sbi', 'icici', 'axis', 'kotak', 'pnb', 'punjab national',
  'baroda', 'yes bank', 'indusind', 'idfc', 'au ', 'au small',
  'canara', 'rbl', 'federal', 'standard chartered', 'hsbc',
  'amex', 'american express', 'citibank', 'citi',
  'union bank', 'flipkart', 'amazon', 'swiggy',
  'zomato', 'tata', 'bpcl', 'indian oil', 'iocl', 'myntra',
];

/**
 * Returns true if the card passes all 4 validation rules.
 * Used by scrapeDeal4Loans() before pushing a card object.
 */
function isValidCard(cardName, bankName) {
  if (!cardName || typeof cardName !== 'string') return false;
  const name = cardName.toLowerCase().trim();
  const bank = (bankName || '').toLowerCase().trim();

  // Rule 2 — length between 5 and 80 chars
  if (name.length < 5 || name.length > 80) {
    console.log(`    [Deal4Loans] REJECT (length): "${cardName}"`);
    return false;
  }

  // Rule 3 — reject forbidden phrases
  for (const phrase of CARD_REJECT_PHRASES) {
    if (name.includes(phrase.toLowerCase())) {
      console.log(`    [Deal4Loans] REJECT (phrase "${phrase}"): "${cardName}"`);
      return false;
    }
  }

  // Rule 1 — must contain at least one card keyword
  const hasKeyword = CARD_KEYWORDS.some(kw => name.includes(kw));
  if (!hasKeyword) {
    console.log(`    [Deal4Loans] REJECT (no card keyword): "${cardName}"`);
    return false;
  }

  // Rule 4 — bank name must be a known Indian bank (if bankName is available)
  if (bank && bank.length >= 3) {
    const knownBank = KNOWN_BANKS.some(kb => bank.includes(kb));
    if (!knownBank) {
      console.log(`    [Deal4Loans] REJECT (unknown bank "${bankName}"): "${cardName}"`);
      return false;
    }
  }

  return true;
}

// ── Source 1: CardInsider ─────────────────────────────────────────────────────
// Unchanged ✅ — working fine

async function scrapeCardInsider() {
  const url  = 'https://www.cardinsider.com/credit-cards/';
  const html = await fetchPage(url, 'https://www.cardinsider.com/', 15000);
  const $    = cheerio.load(html);
  const cards = [];

  debugHtml('CardInsider', html, 500);

  const CARD_SELECTORS = [
    '.card-listing-item',
    '[class*="CreditCardItem"]',
    'article.card-item',
    '.credit-card-list .item',
    '[class*="creditCardListing"] li',
    '[class*="cardListing"] .card',
    '.card-item',
    '.credit-card-item',
    'article.card',
    '[class*="cardItem"]',
    '[class*="card-listing"]',
    '.cards-listing article',
    '.card-listing-section .card',
    '[class*="card"][class*="item"]',
    '[class*="card"][class*="list"]',
    'li[class*="card"]',
  ];

  let hitSelector = null;
  for (const sel of CARD_SELECTORS) {
    const els = $(sel);
    if (els.length >= 3) {
      hitSelector = sel;
      els.each((_, el) => {
        const $el = $(el);

        const cardRaw = (
          $el.find('[class*="card-name"], [class*="cardName"], [class*="card-title"]').first().text().trim() ||
          $el.find('h2, h3, h4').first().text().trim() ||
          $el.find('a').first().text().trim()
        );

        const bankRaw = (
          $el.find('[class*="bank"], [class*="issuer"], [class*="Bank"]').first().text().trim() ||
          $el.find('[class*="card-bank"]').first().text().trim() ||
          $el.find('p, span').filter((_, e) => /bank/i.test($(e).text())).first().text().trim()
        );

        const feeRaw      = $el.find('[class*="fee"], [class*="annual"], [class*="Fee"]').first().text().trim();
        const netRaw      = $el.find('img[alt*="Visa"], img[alt*="Master"], img[alt*="Rupay"], img[alt*="Amex"]').first().attr('alt') ||
                            $el.find('[class*="network"], [class*="Network"]').first().text().trim() || '';
        const cashbackRaw = $el.find('[class*="cashback"], [class*="reward"], [class*="Reward"]').first().text().trim();
        const applyHref   = $el.find('a[href*="credit-card"], a[href*="apply"], a').first().attr('href') || url;

        if (!cardRaw || cardRaw.length < 4) return;
        if (/^[\w\s]+ credit cards?$/i.test(cardRaw)) return;
        if (cardRaw.split(' ').length < 2) return;

        cards.push({
          bankName:           canonicalBankName(bankRaw || cardRaw),
          cardName:           cardRaw,
          annualFee:          parseINR(feeRaw),
          joiningFee:         parseINR(feeRaw),
          cashback:           parseRate(cashbackRaw) || 0,
          rewardsDescription: cashbackRaw || '',
          network:            normalizeNetwork(netRaw),
          applyUrl:           applyHref.startsWith('http') ? applyHref : `https://www.cardinsider.com${applyHref}`,
          source:             'cardinsider',
        });
      });
      break;
    }
  }

  if (hitSelector) {
    console.log(`  🎯 [CardInsider] Hit selector: "${hitSelector}", raw items: ${cards.length}`);
  } else {
    console.log('  ⚠️  [CardInsider] No grid selector matched. Trying heading links...');
  }

  // Fallback A: heading links
  // Only accept links that look like actual credit card product pages.
  const ARTICLE_REJECT_PHRASES = [
    'how to', 'what is', 'review', 'guide', 'lounge', 'airport',
    'google pay', 'add your', 'against a', 'apply for', 'calculator',
    'insurance', 'vs ', 'comparison', 'best credit cards', 'top credit cards',
  ];

  if (cards.length < 3) {
    $('h2 a, h3 a, h4 a').each((_, el) => {
      const $a    = $(el);
      const href  = $a.attr('href') || '';
      const text  = $a.text().trim();
      if (!href.includes('cardinsider.com') && !href.startsWith('/')) return;
      if (!text || text.length < 5 || text.length > 80) return;
      if (/^[\w\s]+ credit cards?$/i.test(text)) return;
      if (text.split(' ').length < 2) return;

      // Reject blog posts, how-to guides, reviews, listicles
      const textLower = text.toLowerCase();
      if (ARTICLE_REJECT_PHRASES.some(p => textLower.includes(p))) return;

      // Must contain at least one card-product keyword to qualify
      const hasCardKw = CARD_KEYWORDS.some(kw => textLower.includes(kw));
      if (!hasCardKw) return;

      const $container = $a.closest('[class*="card"], [class*="item"], li, article, div');
      const feeRaw     = $container.find('[class*="fee"], [class*="annual"]').first().text().trim();
      const netRaw     = $container.find('img[alt]').first().attr('alt') || '';
      const fullUrl    = href.startsWith('http') ? href : `https://www.cardinsider.com${href}`;

      cards.push({
        bankName:           canonicalBankName(text),
        cardName:           text,
        annualFee:          parseINR(feeRaw),
        joiningFee:         parseINR(feeRaw),
        cashback:           0,
        rewardsDescription: '',
        network:            normalizeNetwork(netRaw),
        applyUrl:           fullUrl,
        source:             'cardinsider',
      });
    });
    console.log(`  🔗 [CardInsider] Heading-link fallback found: ${cards.length} entries`);
  }

  // Fallback B: table rows
  if (cards.length < 3) {
    $('table tr').each((_, row) => {
      const cells = $(row).find('td').toArray().map(c => $(c).text().trim());
      if (cells.length < 2) return;
      const cardName = cells[0] || cells[1];
      if (!cardName || cardName.length < 4) return;
      if (/^(card name|bank|fee|sl)$/i.test(cardName)) return;
      cards.push({
        bankName:           canonicalBankName(cells[1] || ''),
        cardName,
        annualFee:          parseINR(cells[2] || '0'),
        joiningFee:         parseINR(cells[2] || '0'),
        cashback:           0,
        rewardsDescription: '',
        network:            null,
        applyUrl:           url,
        source:             'cardinsider',
      });
    });
    console.log(`  📋 [CardInsider] Table fallback found: ${cards.length} entries`);
  }

  if (cards.length === 0) {
    console.log('[CardInsider] ❌ ALL selectors failed. Raw HTML sample (first 800 chars):');
    console.log(String(html).replace(/\s+/g, ' ').trim().slice(0, 800));
  }

  return cards;
}

// ── Source 2: MyMoneyMantra ───────────────────────────────────────────────────
// Unchanged ✅

async function scrapeMyMoneyMantra() {
  const MMM_URLS = [
    'https://www.mymoneymantra.com/credit-card/',
    'https://www.mymoneymantra.com/best-credit-cards/',
    'https://www.mymoneymantra.com/credit-cards/',
  ];

  let html, finalUrl;
  try {
    ({ data: html, finalUrl } = await fetchPageWithFallback(MMM_URLS, 'https://www.mymoneymantra.com/', 15000));
    console.log(`  ↳ [MMM] Loaded from: ${finalUrl}`);
  } catch (err) {
    throw new Error(`MyMoneyMantra: all URLs failed — ${err.message}`);
  }

  const $     = cheerio.load(html);
  const cards = [];

  debugHtml('MyMoneyMantra', html, 200);

  const selectors = [
    '[class*="cardList"] [class*="cardItem"]',
    '[class*="creditCard"] [class*="card"]',
    '.card-listing li',
    '.card-box', '.product-card', '.credit-card-box',
    '[class*="cardBox"]', '[class*="card-item"]',
    '.card-details', '.cc-card',
  ];

  for (const sel of selectors) {
    const els = $(sel);
    if (els.length >= 2) {
      els.each((_, el) => {
        const $el       = $(el);
        const bankRaw   = $el.find('[class*="bank"], [class*="issuer"], .bank-name').first().text().trim();
        const cardRaw   = (
          $el.find('[class*="card-name"], [class*="cardName"], h2, h3, h4').first().text().trim() ||
          $el.find('a').first().text().trim()
        );
        const feeText   = $el.find('[class*="fee"], [class*="annual"]').first().text().trim();
        const applyHref = $el.find('a[href*="apply"], a[href*="credit"], a').first().attr('href') || finalUrl;
        const netText   = $el.find('img[alt*="Visa"], img[alt*="Master"], img[alt*="Rupay"]').first().attr('alt') || '';
        const rewardTxt = $el.find('[class*="reward"], [class*="cashback"], [class*="benefit"]').first().text().trim();

        if (!cardRaw || cardRaw.length < 4) return;
        if (/^[\w\s]+ credit cards?$/i.test(cardRaw)) return;

        const bankName = canonicalBankName(bankRaw || cardRaw);
        cards.push({
          bankName,
          cardName:           cardRaw,
          annualFee:          parseINR(feeText),
          joiningFee:         parseINR(feeText),
          cashback:           parseRate(rewardTxt) || 0,
          rewardsDescription: rewardTxt,
          network:            normalizeNetwork(netText),
          applyUrl:           applyHref.startsWith('http') ? applyHref : `https://www.mymoneymantra.com${applyHref}`,
          source:             'mymoneymantra',
        });
      });
      if (cards.length >= 2) break;
    }
  }

  if (cards.length < 2) {
    $('table tr').each((_, row) => {
      const cells = $(row).find('td').toArray().map(c => $(c).text().trim());
      if (cells.length < 3) return;
      const cardName = cells[0];
      if (!cardName || cardName.length < 4 || /^(name|card|bank)$/i.test(cardName)) return;
      cards.push({
        bankName:           canonicalBankName(cells[1] || ''),
        cardName,
        annualFee:          parseINR(cells[2] || '0'),
        joiningFee:         parseINR(cells[2] || '0'),
        cashback:           parseRate(cells[3] || '') || 0,
        rewardsDescription: cells[4] || '',
        network:            null,
        applyUrl:           finalUrl,
        source:             'mymoneymantra',
      });
    });
  }

  if (cards.length === 0) {
    // Fallback: Heading links
    $('h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (!text.toLowerCase().includes('card') || text.split(' ').length > 10) return;

      cards.push({
        bankName:           canonicalBankName(text),
        cardName:           text,
        annualFee:          0,
        joiningFee:         0,
        cashback:           0,
        rewardsDescription: '',
        network:            null,
        applyUrl:           finalUrl,
        source:             'mymoneymantra',
      });
    });
    console.log(`  🔗 [MyMoneyMantra] Heading fallback found: ${cards.length} entries`);
  }

  return cards;
}

// ── Source 3: BankBazaar ──────────────────────────────────────────────────────

async function scrapeBankBazaar() {
  const url  = 'https://www.bankbazaar.com/credit-card.html';
  const html = await fetchPage(url, 'https://www.bankbazaar.com/', 15000);
  const $    = cheerio.load(html);
  const cards = [];

  debugHtml('BankBazaar', html, 200);

  $('table tr').each((rowIdx, row) => {
    if (rowIdx === 0) return;
    const cells = $(row).find('td').toArray().map(c => $(c).text().replace(/\s+/g, ' ').trim());
    if (cells.length < 2) return;
    
    const text = cells[0];
    if (/eligibility|fees|salary|application|what|why|how|features/i.test(text)) return;
    if (text.length > 120 || text.split(' ').length > 15) return;
    
    // Check if it really represents a card
    if (!text.toLowerCase().includes('card') && !/hdfc|sbi|icici|axis|rbl|kotak|hsbc|standard chartered/i.test(text)) return;

    const bankName = canonicalBankName(text);
    if (!isValidCard(text, bankName)) return;

    // Clean up BB appended text like "Reward Points", "Travel and Dining"
    const cardName = text.replace(/(Reward Points|Travel and Dining|Cashback|Shopping)$/i, '').trim();

    cards.push({
      bankName,
      cardName,
      annualFee:          parseINR(cells[1] || '0'),
      joiningFee:         parseINR(cells[1] || '0'),
      cashback:           0,
      rewardsDescription: cells[1] || '',
      network:            null,
      applyUrl:           url,
      source:             'bankbazaar',
    });
  });

  console.log(`  🎯 [BankBazaar] Extracted ${cards.length} credit cards from tables`);
  return cards;
};

// ── Deduplication ──────────────────────────────────────────────────────────────

function deduplicateLiveCards(cards) {
  const seen = new Map();
  for (const card of cards) {
    const key = `${slugify(card.bankName)}|${slugify(card.cardName)}`;
    if (!key || key === '|') continue;
    if (!seen.has(key)) seen.set(key, card);
  }
  return Array.from(seen.values());
}

// ── Main Export ────────────────────────────────────────────────────────────────

async function scrapeCardSourcesLive() {
  const allCards = [];
  const sourceBreakdown = {};
  const errors = [];

  const sources = [
    { name: 'CardInsider',   fn: scrapeCardInsider   },
    { name: 'MyMoneyMantra', fn: scrapeMyMoneyMantra },
    { name: 'BankBazaar',    fn: scrapeBankBazaar    },
  ];

  for (const src of sources) {
    try {
      const cards = await src.fn();
      const valid = cards.filter(c => c.cardName && c.cardName.length >= 4 && c.bankName);
      sourceBreakdown[src.name] = valid.length;
      allCards.push(...valid);

      if (valid.length > 0) {
        console.log(`  ✅ [CardLive] ${src.name}: ${valid.length} cards`);
      } else {
        console.log(`  ⚠️  [CardLive] ${src.name}: 0 valid cards (site structure may differ)`);
      }
    } catch (err) {
      const msg = `${src.name}: ${err.message}`;
      errors.push(msg);
      console.log(`  ❌ [CardLive] ${msg}`);
      sourceBreakdown[src.name] = 0;
    }
  }

  const deduped = deduplicateLiveCards(allCards);

  return {
    cards:           deduped,
    count:           deduped.length,
    sourceBreakdown,
    errors,
  };
}

module.exports = { scrapeCardSourcesLive };
