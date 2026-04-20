'use strict';

/**
 * scraper/parsers/aggregatorParsers.js
 *
 * REBUILT with EXACT selectors verified against live page HTML.
 * All three sources respond to plain axios GET — NO Playwright, NO timeouts.
 *
 * Verified structures (April 2026):
 *
 * Paisabazaar  → card blocks contain: card name as <h3>/<a>, joining/annual fee
 *                as text "Joining fee: ₹NNN", rewards as text after fee line,
 *                apply link href pointing to /hdfc-bank/... etc.
 *
 * BankBazaar   → "Top Credit Cards" table with:
 *                <a href="/credit-card/xxx"> as card link+name,
 *                adjacent <td> as category
 *
 * CardInsider  → Card listings with:
 *                <h3><a href="...">Card Name</a></h3>
 *                "Joining Fee₹NNN", "Annual Fee₹NNN", "Rewards RateXXX"
 *                "Apply Now" link href
 */

const cheerio = require('cheerio');

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Extract first number from a string like "₹1,000 + GST" or "Lifetime Free" */
function extractINR(text = '') {
  const t = String(text).replace(/,/g, '');
  if (/free|nil|zero|waived/i.test(t)) return 0;
  const m = t.match(/[\d]+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Extract numeric % rate from strings like "41.88% p.a." */
function extractRate(text = '') {
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Guess bank name from a card URL slug like
 * "/hdfc-bank/millennia-credit-card/" → "HDFC Bank"
 * "/sbi-bank/cashback-sbi-card/"      → "State Bank of India"
 */
function bankFromSlug(slug = '') {
  const SLUG_MAP = {
    'hdfc-bank':                'HDFC Bank',
    'hdfc':                     'HDFC Bank',
    'sbi-bank':                 'State Bank of India',
    'sbi-card':                 'State Bank of India',
    'icici-bank':               'ICICI Bank',
    'icici':                    'ICICI Bank',
    'axis-bank':                'Axis Bank',
    'axis':                     'Axis Bank',
    'kotak-mahindra-bank':      'Kotak Mahindra Bank',
    'kotak':                    'Kotak Mahindra Bank',
    'indusind-bank':            'IndusInd Bank',
    'indusind':                 'IndusInd Bank',
    'idfc-first-bank':          'IDFC First Bank',
    'idfc-first':               'IDFC First Bank',
    'idfc':                     'IDFC First Bank',
    'au-small-finance-bank':    'AU Small Finance Bank',
    'au-bank':                  'AU Small Finance Bank',
    'au':                       'AU Small Finance Bank',
    'yes-bank':                 'Yes Bank',
    'rbl-bank':                 'RBL Bank',
    'rbl':                      'RBL Bank',
    'federal-bank':             'Federal Bank',
    'standard-chartered-bank':  'Standard Chartered Bank',
    'standard-chartered':       'Standard Chartered Bank',
    'hsbc-bank':                'HSBC Bank',
    'hsbc':                     'HSBC Bank',
    'amex-bank':                'American Express',
    'american-express':         'American Express',
    'bob':                      'Bank of Baroda',
    'bank-of-baroda':           'Bank of Baroda',
    'pnb':                      'Punjab National Bank',
    'punjab-national-bank':     'Punjab National Bank',
    'canara-bank':              'Canara Bank',
  };
  const part = slug.split('/').filter(Boolean)[0] || '';
  return SLUG_MAP[part.toLowerCase()] || null;
}

/** Detect network type from text */
function detectNetwork(text = '') {
  const t = String(text);
  if (/rupay/i.test(t)) return 'RuPay';
  if (/mastercard/i.test(t)) return 'Mastercard';
  if (/amex|american express/i.test(t)) return 'Amex';
  if (/visa/i.test(t)) return 'Visa';
  if (/diners/i.test(t)) return 'Diners';
  return null;
}

/** Detect rewards type from rewards description text */
function detectRewardsType(text = '') {
  const t = String(text).toLowerCase();
  if (/cashback/i.test(t)) return 'cashback';
  if (/travel|miles|lounge/i.test(t)) return 'travel';
  if (/shopping|myntra|flipkart|amazon/i.test(t)) return 'shopping';
  if (/fuel|petrol/i.test(t)) return 'fuel';
  if (/reward points|edge|neucoins/i.test(t)) return 'rewards';
  return 'general';
}

// ── Paisabazaar Parser ────────────────────────────────────────────────────────
/*
 * Verified structure (from live content.md):
 *
 * Each card block looks like:
 *   [Card Name as <a href="/hdfc-bank/hdfc-regalia-gold-credit-card/">]
 *   "Joining fee: ₹2500"
 *   "Annual/Renewal Fee: ₹2500"
 *   "5X reward points on Nykaa..."
 *   "[Check Eligibility](...)" or "Product Details\n- ..."
 */
function parsePaisabazaar(html) {
  const $ = cheerio.load(html);
  const cards = [];

  // Paisabazaar's card listing — each card is an <a> tag linking to detail pages
  // Pattern observed: card names appear as h3-level text before "Joining fee:"
  const cardBlocks = [];

  // Strategy: find all "Joining fee:" occurrences and walk up to get card context
  $('*').filter((_, el) => {
    const text = $(el).text();
    return /joining fee[:\s]/i.test(text) && text.length < 2000;
  }).each((_, el) => {
    cardBlocks.push(el);
  });

  // Also parse from direct link structure
  $('a[href*="/credit-card/"]').each((_, el) => {
    const $el   = $(el);
    const href  = $el.attr('href') || '';
    const text  = $el.text().trim();

    // Skip navigation links and short text
    if (text.length < 5 || /compare|apply|check|know|view/i.test(text)) return;
    if (!/credit.card/i.test(href)) return;

    const bankName = bankFromSlug(href.replace('https://www.paisabazaar.com', ''));
    if (!bankName) return;

    // Walk up to get the parent container for fee/rewards info
    const $parent   = $el.closest('div, section, article, li').first();
    const parentText = $parent.text();

    // Extract joining fee from nearby text
    const joiningFeeMatch = parentText.match(/joining fee[:\s₹]*([0-9,]+)/i);
    const annualFeeMatch  = parentText.match(/annual[^₹]*fee[:\s₹]*([0-9,]+)/i);
    const joiningFee      = joiningFeeMatch ? parseInt(joiningFeeMatch[1].replace(/,/g, '')) : 0;
    const annualFee       = annualFeeMatch  ? parseInt(annualFeeMatch[1].replace(/,/g, ''))  : joiningFee;
    const cashbackMatch   = parentText.match(/(\d+(?:\.\d+)?)\s*%\s*cashback/i);
    const cashback        = cashbackMatch ? parseFloat(cashbackMatch[1]) : 0;
    const lounge          = /lounge/i.test(parentText);
    const network         = detectNetwork(parentText);
    const rewardsType     = detectRewardsType(parentText);

    // Extract rewards description — look for lines describing benefits
    const benefitLines = parentText.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 20 && l.length < 200 && !/joining|annual|fee|check|apply|know/i.test(l))
      .slice(0, 2);
    const rewardsDesc = benefitLines.join('; ') || '';

    // Build apply URL
    const applyUrl = href.startsWith('http') ? href : `https://www.paisabazaar.com${href}`;

    cards.push({
      cardName:    text,
      bankName,
      annualFee,
      joiningFee,
      cashback,
      lounge,
      network,
      rewardsType,
      rewardsDescription: rewardsDesc,
      applyUrl,
      source:      'paisabazaar',
    });
  });

  // Deduplicate by card name
  const seen = new Set();
  return cards.filter(c => {
    if (seen.has(c.cardName)) return false;
    seen.add(c.cardName);
    return c.cardName.length > 5 && c.bankName && c.bankName.length > 2;
  });
}

// ── BankBazaar Parser ─────────────────────────────────────────────────────────
/*
 * Verified structure (from live content.md):
 *
 * "Top Credit Cards in India 2026" table:
 *   Credit Card | Category
 *   [RBL Bank BankBazaar SaveMax...] (link) | Reward Points
 *   [FinBooster: YES BANK...]         | Reward Points
 *   etc.
 *
 * Also individual card links within category lists.
 */
function parseBankBazaar(html) {
  const $ = cheerio.load(html);
  const cards = [];

  // Parse the verified "Top Credit Cards" table
  // Pattern: <a href="/credit-card/xxx-credit-card.html">Card Name</a> followed by category text
  $('a[href*="/credit-card/"]').each((_, el) => {
    const $el   = $(el);
    const href  = $el.attr('href') || '';
    const text  = $el.text().trim();

    // Only card detail pages, not category/list pages
    if (!href.includes('/credit-card/') || !/\.html/.test(href)) return;
    if (text.length < 8 || /compare|view|apply|check|top.10|best|fuel|travel|lounge|student/i.test(text)) return;

    // Bank name from URL slug
    // e.g. /credit-card/rbl-bank-bankbazaar-savemax-credit-card.html
    const slug = href.split('/credit-card/')[1] || '';
    let bankName = null;

    // Try to extract bank from slug
    for (const key of ['hdfc', 'sbi', 'icici', 'axis', 'indusind', 'kotak', 'idfc-first', 'au-bank', 'yes-bank',
                        'rbl-bank', 'federal-bank', 'hsbc', 'standard-chartered', 'amex', 'american-express',
                        'bob', 'canara', 'pnb', 'union-bank', 'bank-of-baroda', 'bank-of-india']) {
      if (slug.toLowerCase().includes(key.toLowerCase())) {
        bankName = bankFromSlug(key) || bankFromSlug(key.split('-')[0]);
        break;
      }
    }
    if (!bankName) return;

    // Look for category text nearby
    const $row    = $el.closest('tr, li, div').first();
    const rowText = $row.text();
    const rewardsType = detectRewardsType(rowText + ' ' + text);
    const cashbackMatch = (rowText + text).match(/(\d+(?:\.\d+)?)\s*%\s*cashback/i);

    const applyUrl = href.startsWith('http') ? href : `https://www.bankbazaar.com${href}`;

    cards.push({
      cardName:    text,
      bankName,
      annualFee:   null,
      joiningFee:  null,
      cashback:    cashbackMatch ? parseFloat(cashbackMatch[1]) : 0,
      lounge:      /lounge/i.test(rowText),
      network:     detectNetwork(rowText),
      rewardsType,
      rewardsDescription: '',
      applyUrl,
      source:      'bankbazaar',
    });
  });

  // Deduplicate
  const seen = new Set();
  return cards.filter(c => {
    if (seen.has(c.cardName)) return false;
    seen.add(c.cardName);
    return c.cardName.length > 5;
  });
}

// ── CardInsider Parser ────────────────────────────────────────────────────────
/*
 * Verified structure (from live content.md):
 *
 * ### [Flipkart Axis Bank Credit Card](https://cardinsider.com/axis-bank/flipkart-axis-bank-credit-card/)
 * 4.6/5
 * [Apply Now](https://cardinsider.com/go/axisbank)
 * - Joining Fee₹500 + GST
 * - Annual Fee₹500 + GST
 * - Rewards Rate5% Cashback on Flipkart & Cleartrip...
 * - Welcome Benefits₹250 Flipkart Voucher...
 */
function parseCardInsider(html) {
  const $ = cheerio.load(html);
  const cards = [];

  // CardInsider's card listings: each card has an <h3> with a link to card detail
  $('h3 a[href*="cardinsider.com/"]').each((_, el) => {
    const $el   = $(el);
    const href  = $el.attr('href') || '';
    const text  = $el.text().trim();

    if (text.length < 5) return;
    if (/apollo|vs |compared/i.test(text)) return; // skip comparison articles

    // Extract bank from URL: cardinsider.com/axis-bank/flipkart-...
    const pathParts = href.replace('https://cardinsider.com/', '').replace('https://www.cardinsider.com/', '');
    const bankSlug  = pathParts.split('/')[0] || '';
    const bankName  = bankFromSlug(bankSlug) || cardInsiderBankFromSlug(bankSlug);

    if (!bankName) return;

    // Walk up to find the card's full block with fee/rewards
    const $section = $el.closest('section, div, article').first();
    let blockText  = '';

    // Look forward in siblings after the h3
    $el.parent().parent().nextAll().slice(0, 8).each((__, sib) => {
      blockText += $(sib).text() + '\n';
    });
    if (!blockText) blockText = $section.text();

    // Extract fees from format "Joining Fee₹500 + GST" or "Joining FeeLifetime Free"
    const joiningFeeMatch = blockText.match(/Joining Fee\s*[₹]?\s*([0-9,]+)/i);
    const annualFeeMatch  = blockText.match(/Annual Fee\s*[₹]?\s*([0-9,]+)/i);
    const joiningFee      = joiningFeeMatch ? parseInt(joiningFeeMatch[1].replace(/,/g, '')) : (/lifetime free/i.test(blockText) ? 0 : null);
    const annualFee       = annualFeeMatch  ? parseInt(annualFeeMatch[1].replace(/,/g, ''))  : joiningFee;

    // Extract rewards rate description
    const rewardsMatch  = blockText.match(/Rewards Rate\s*(.{10,120}?)(?:\n|Welcome|$)/i);
    const rewardsDesc   = rewardsMatch ? rewardsMatch[1].trim() : '';
    const cashbackMatch = rewardsDesc.match(/(\d+(?:\.\d+)?)\s*%\s*(?:cashback|cash)/i) ||
                          blockText.match(/(\d+(?:\.\d+)?)\s*%\s*(?:cashback|cash)/i);
    const cashback      = cashbackMatch ? parseFloat(cashbackMatch[1]) : 0;

    // Apply URL — use the card detail URL
    const applyUrl = href.startsWith('http') ? href : `https://www.cardinsider.com${href}`;

    cards.push({
      cardName:           text,
      bankName,
      annualFee,
      joiningFee,
      cashback,
      lounge:             /lounge/i.test(blockText),
      network:            detectNetwork(blockText),
      rewardsType:        detectRewardsType(rewardsDesc || blockText),
      rewardsDescription: rewardsDesc,
      applyUrl,
      source:             'cardinsider',
    });
  });

  // Deduplicate
  const seen = new Set();
  return cards.filter(c => {
    if (seen.has(c.cardName)) return false;
    seen.add(c.cardName);
    return c.cardName.length > 5;
  });
}

/** CardInsider-specific bank slug mapping (their slugs differ slightly) */
function cardInsiderBankFromSlug(slug = '') {
  const MAP = {
    'hdfc-bank':       'HDFC Bank',
    'sbi-card':        'State Bank of India',
    'icici-bank':      'ICICI Bank',
    'axis-bank':       'Axis Bank',
    'kotak':           'Kotak Mahindra Bank',
    'indusind-bank':   'IndusInd Bank',
    'idfc-first-bank': 'IDFC First Bank',
    'au-bank':         'AU Small Finance Bank',
    'yes-bank':        'Yes Bank',
    'rbl-bank':        'RBL Bank',
    'federal-bank':    'Federal Bank',
    'standard-chartered': 'Standard Chartered Bank',
    'hsbc-bank':       'HSBC Bank',
    'american-express':'American Express',
    'bank-of-baroda':  'Bank of Baroda',
  };
  return MAP[slug.toLowerCase()] || null;
}

module.exports = { parseBankBazaar, parsePaisabazaar, parseCardInsider };
