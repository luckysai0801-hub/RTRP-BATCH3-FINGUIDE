/**
 * scraper/sources/fdScraperLive.js (v3 — Groww + MyLoanCare removed)
 *
 * TIER 2 — Live Fixed Deposit Aggregator Scraper
 * ══════════════════════════════════════════════════════════════════════
 * CHANGES in v3:
 *   - Groww REMOVED (both scrapeGrowwFD + scrapeGrowwFDRates).
 *     Groww uses Next.js client-side rendering — Cheerio gets 0 rows.
 *   - MyLoanCare FD REMOVED — consistently times out.
 *   - BankBazaar FD ADDED (plain HTML, 10s timeout)
 *     URL: https://www.bankbazaar.com/fixed-deposit-rate.html
 *   - Paisabazaar FD ADDED (plain HTML, 10s timeout)
 *     URL: https://www.paisabazaar.com/fixed-deposit/
 *   - Both new sources: validate rate 3–10%, known bank name,
 *     reject records where bankName contains "%" or is numeric.
 *   - RBI deposit rates: unchanged ✅ (73 records working)
 * ══════════════════════════════════════════════════════════════════════
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const { canonicalBankName } = require('../utils/normalizer');
const { slugify } = require('../utils/parsers');

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

// ── HTTP Helpers ───────────────────────────────────────────────────────────────

async function fetchPage(url, referer = 'https://www.google.co.in/', timeout = 15000) {
  const { data } = await axios.get(url, {
    timeout,
    maxRedirects: 5,
    headers: {
      'User-Agent':      nextUA(),
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer':         referer,
      'Cache-Control':   'no-cache',
      'DNT':             '1',
    },
  });
  return data;
}

async function fetchFirstWorking(urls, referer, timeout = 15000) {
  let lastErr;
  for (const url of urls) {
    try {
      const html = await fetchPage(url, referer, timeout);
      return { html, url };
    } catch (err) {
      console.log(`    ↳ [fetch] ${url} → ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr || new Error('All URLs failed');
}

// ── HTML Debug Helper ──────────────────────────────────────────────────────────

function debugHtml(label, html, chars = 200) {
  const snippet = String(html || '').replace(/\s+/g, ' ').trim().slice(0, chars);
  console.log(`  🔍 [DEBUG ${label}] HTML: ${snippet}`);
}

// ── Shared Rate/Tenure/Amount Parsers ──────────────────────────────────────────

/**
 * Extracts the best (highest) numeric rate from a string.
 * Returns null if nothing valid found.
 */
function parseBestRate(str) {
  if (!str) return null;
  const clean = String(str).replace(/[%,\s]/g, ' ').trim();
  const matches = [...clean.matchAll(/(\d+\.?\d*)/g)].map(m => parseFloat(m[1]));
  const valid   = matches.filter(v => v >= 1 && v <= 15);
  if (!valid.length) return null;
  return Math.max(...valid);
}

function parseTenureDays(str) {
  if (!str) return null;
  const s = String(str).toLowerCase().trim();

  const dayMatch = s.match(/(\d+)\s*day/);
  if (dayMatch) return parseInt(dayMatch[1], 10);

  const moMatch = s.match(/(\d+\.?\d*)\s*month/);
  if (moMatch) return Math.round(parseFloat(moMatch[1]) * 30);

  const yrMatch = s.match(/(\d+\.?\d*)\s*year/);
  if (yrMatch) return Math.round(parseFloat(yrMatch[1]) * 365);

  const numMatch = s.match(/^(\d+)$/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    return n < 30 ? n : n * 30;
  }

  return null;
}

function parseMinAmount(str) {
  if (!str) return 1000;
  const s = String(str).toLowerCase().replace(/[₹,\s]/g, '');
  const lakh = s.match(/(\d+\.?\d*)lakh/);
  if (lakh) return Math.round(parseFloat(lakh[1]) * 100000);
  const num = s.match(/(\d+)/);
  if (num) return parseInt(num[1], 10);
  return 1000;
}

// ── FD Validation Guard ────────────────────────────────────────────────────────
//
// Used by both BankBazaar FD and Paisabazaar FD parsers.
// Rejects: rates outside 3–10%, numeric bank names, bank names containing "%".

const KNOWN_FD_BANKS = [
  'hdfc', 'sbi', 'icici', 'axis', 'kotak', 'pnb', 'punjab national',
  'baroda', 'bank of baroda', 'yes bank', 'indusind', 'idfc', 'au ',
  'au small', 'canara', 'rbl', 'federal', 'standard chartered', 'hsbc',
  'citibank', 'citi', 'union bank', 'bandhan', 'equitas', 'ujjivan',
  'jana', 'suryoday', 'esaf', 'utkarsh', 'north east', 'nainital',
  'karnataka', 'karur vysya', 'city union', 'dhanlaxmi', 'tamilnad',
  'catholic syrian', 'south indian', 'kerala', 'dcb', 'rmb',
  'shriram', 'bajaj', 'mahindra', 'tata', 'aditya birla', 'piramal',
  'bajaj finance', 'lic', 'post office',
];

/**
 * Returns true if the FD record is valid and should be kept.
 * @param {string} bankName   — resolved canonical name
 * @param {number} rate       — interest rate %
 */
function isValidFD(bankName, rate) {
  if (!bankName || typeof bankName !== 'string') return false;
  const name = bankName.trim();

  // Reject if bank name is purely numeric or contains '%'
  if (/^\d+$/.test(name) || name.includes('%')) {
    console.log(`    [FD] REJECT (numeric/% bank name): "${name}"`);
    return false;
  }

  // Reject tenure labels misread as bank names: "1 year", "2 years", "3 months", "1-year tenure"
  if (/^\d+[-\s]*(year|yr|month|mo)s?(\s+tenure)?$/i.test(name) || /^\d+\s*-\s*\d+\s*(year|month)/i.test(name)) {
    console.log(`    [FD] REJECT (tenure label, not a bank): "${name}"`);
    return false;
  }

  // Reject if bank name is very short (likely a column header fragment)
  if (name.length < 3) {
    console.log(`    [FD] REJECT (too short bank name): "${name}"`);
    return false;
  }

  // Rate must be between 3% and 10%
  if (typeof rate === 'number' && (rate < 3 || rate > 10)) {
    console.log(`    [FD] REJECT (rate ${rate}% out of range): "${name}"`);
    return false;
  }

  // Bank name must be recognised (soft check — only hard-reject if name looks like junk)
  const nameLower  = name.toLowerCase();
  const isKnown    = KNOWN_FD_BANKS.some(kb => nameLower.includes(kb));
  // If cannot match any bank, only reject if it looks like header text
  const looksLikeHeader = /^(bank|lender|institution|name|sl|#|rate|interest|tenure|year|years|month|months|period|duration)$/i.test(name.trim());
  if (looksLikeHeader) {
    console.log(`    [FD] REJECT (header row): "${name}"`);
    return false;
  }

  if (!isKnown) {
    // Warn but don't hard-reject — some NBFCs/co-op banks may not be in our list
    console.log(`    [FD] WARN (bank not in known list, keeping): "${name}"`);
  }

  return true;
}

// ── Source 1: BankBazaar FD Rates ─────────────────────────────────────────────
// Plain HTML, 10s timeout. Replaces Groww.

async function scrapeBankBazaarFD() {
  const BB_URLS = [
    'https://www.bankbazaar.com/fixed-deposit-rate.html',
    'https://www.bankbazaar.com/fixed-deposit.html',
  ];

  let html, usedUrl;
  try {
    ({ html, url: usedUrl } = await fetchFirstWorking(BB_URLS, 'https://www.bankbazaar.com/', 10000));
    console.log(`  ↳ [BankBazaar-FD] Loaded from: ${usedUrl}`);
  } catch (err) {
    throw new Error(`BankBazaar-FD: all URLs failed — ${err.message}`);
  }

  debugHtml('BankBazaar-FD', html, 200);

  const $   = cheerio.load(html);
  const fds = [];

  // Try multiple table selectors in order of specificity
  const TABLE_SELECTORS = [
    '[class*="fd-rate"] table',
    '[class*="interest-rate-table"] table',
    '[class*="rates-table"] table',
    '.rate-table',
    'table',
  ];

  let parsed = false;
  for (const tblSel of TABLE_SELECTORS) {
    $(tblSel).each((_, tbl) => {
      // Detect which column is bank name vs rate
      const headerCells = $(tbl).find('tr').first().find('th, td')
        .toArray().map(c => $(c).text().trim().toLowerCase());

      const bankCol   = headerCells.findIndex(h => /bank|lender|name|institution/i.test(h));
      const rateCol   = headerCells.findIndex(h => /rate|interest|p\.a/i.test(h));
      const srRateCol = headerCells.findIndex((h, i) => i !== rateCol && /senior|sr\.?|citizen/i.test(h));
      const tenureCol = headerCells.findIndex(h => /tenure|period|duration/i.test(h));
      const amtCol    = headerCells.findIndex(h => /amount|min|deposit/i.test(h));

      $(tbl).find('tbody tr, tr').each((rowIdx, row) => {
        if (rowIdx === 0) return; // skip header
        const cells = $(row).find('td').toArray().map(c => $(c).text().trim());
        if (cells.length < 2) return;

        const bankRaw   = cells[bankCol >= 0 ? bankCol : 0] || cells[0];
        const rateRaw   = cells[rateCol >= 0 ? rateCol : 1] || cells[1];
        const srRateRaw = srRateCol >= 0 ? (cells[srRateCol] || '') : '';
        const tenureRaw = tenureCol >= 0 ? (cells[tenureCol] || '') : (cells[2] || '');
        const amtRaw    = amtCol    >= 0 ? (cells[amtCol]    || '') : (cells[3] || '');

        const bankName = canonicalBankName(bankRaw);
        const rate     = parseBestRate(rateRaw);
        if (!rate) return;

        // ── VALIDATION ──────────────────────────────────────────────────
        if (!isValidFD(bankName, rate)) return;
        // ────────────────────────────────────────────────────────────────

        const srRate   = parseBestRate(srRateRaw) || (rate + 0.5);
        const tenure   = parseTenureDays(tenureRaw) || 365;
        const minAmt   = parseMinAmount(amtRaw);
        const applyUrl = $(row).find('a').first().attr('href') || usedUrl;

        fds.push({
          bankName,
          schemeName:      `${bankName} FD ${Math.round(tenure / 30)} Months`,
          minTenure:       tenure,
          maxTenure:       tenure,
          interestRate:    rate,
          seniorRate:      srRate > rate ? srRate : rate + 0.5,
          minAmount:       minAmt,
          lastUpdatedDate: new Date().toISOString().split('T')[0],
          source:          'bankbazaar_fd',
          applyUrl:        applyUrl.startsWith('http') ? applyUrl : `https://www.bankbazaar.com${applyUrl}`,
        });
      });
    });

    if (fds.length >= 3) { parsed = true; break; }
  }

  // Div/card fallback
  if (!parsed || fds.length < 3) {
    $('[class*="fd-card"], [class*="fdCard"], [class*="bank-card"], [class*="bankCard"], [class*="FdCard"], [class*="rate-card"]').each((_, el) => {
      const $el     = $(el);
      const bankRaw = $el.find('[class*="bank"], [class*="name"], h2, h3, h4').first().text().trim();
      const rateRaw = $el.find('[class*="rate"], [class*="interest"], [class*="Rate"]').first().text().trim();
      const srRaw   = $el.find('[class*="senior"], [class*="Senior"]').first().text().trim();
      if (!bankRaw || !rateRaw) return;

      const bankName = canonicalBankName(bankRaw);
      const rate     = parseBestRate(rateRaw);
      if (!rate) return;

      if (!isValidFD(bankName, rate)) return;

      fds.push({
        bankName,
        schemeName:      `${bankName} FD 1 Year`,
        minTenure:       365,
        maxTenure:       365,
        interestRate:    rate,
        seniorRate:      parseBestRate(srRaw) || (rate + 0.5),
        minAmount:       1000,
        lastUpdatedDate: new Date().toISOString().split('T')[0],
        source:          'bankbazaar_fd',
        applyUrl:        usedUrl,
      });
    });
  }

  console.log(`  📊 [BankBazaar-FD] ${fds.length} FD records parsed`);
  return fds;
}

// ── Source 2: Paisabazaar FD Rates ────────────────────────────────────────────
// Plain HTML, 10s timeout. Replaces MyLoanCare FD.

async function scrapePaisabazaarFD() {
  const PB_URLS = [
    'https://www.paisabazaar.com/fixed-deposit/',
    'https://www.paisabazaar.com/fixed-deposit/interest-rate/',
    'https://www.paisabazaar.com/banking/fixed-deposit/',
  ];

  let html, usedUrl;
  try {
    ({ html, url: usedUrl } = await fetchFirstWorking(PB_URLS, 'https://www.paisabazaar.com/', 10000));
    console.log(`  ↳ [Paisabazaar-FD] Loaded from: ${usedUrl}`);
  } catch (err) {
    throw new Error(`Paisabazaar-FD: all URLs failed — ${err.message}`);
  }

  debugHtml('Paisabazaar-FD', html, 200);

  const $   = cheerio.load(html);
  const fds = [];

  // Try tables first
  $('table').each((_, tbl) => {
    const headerCells = $(tbl).find('tr').first().find('th, td')
      .toArray().map(c => $(c).text().trim().toLowerCase());

    const bankCol   = headerCells.findIndex(h => /bank|lender|name|institution/i.test(h));
    const rateCol   = headerCells.findIndex(h => /rate|interest|p\.a/i.test(h));
    const srRateCol = headerCells.findIndex((h, i) => i !== rateCol && /senior|sr\.?|citizen/i.test(h));
    const tenureCol = headerCells.findIndex(h => /tenure|period|duration/i.test(h));
    const amtCol    = headerCells.findIndex(h => /amount|min|deposit/i.test(h));

    $(tbl).find('tbody tr, tr').each((rowIdx, row) => {
      if (rowIdx === 0) return;
      const cells = $(row).find('td').toArray().map(c => $(c).text().trim());
      if (cells.length < 2) return;

      const bankRaw   = cells[bankCol >= 0 ? bankCol : 0] || cells[0];
      const rateRaw   = cells[rateCol >= 0 ? rateCol : 1] || cells[1];
      const srRateRaw = srRateCol >= 0 ? (cells[srRateCol] || '') : '';
      const tenureRaw = tenureCol >= 0 ? (cells[tenureCol] || '') : (cells[2] || '');
      const amtRaw    = amtCol    >= 0 ? (cells[amtCol]    || '') : (cells[3] || '');

      const bankName = canonicalBankName(bankRaw);
      const rate     = parseBestRate(rateRaw);
      if (!rate) return;

      // ── VALIDATION ──────────────────────────────────────────────────
      if (!isValidFD(bankName, rate)) return;
      // ────────────────────────────────────────────────────────────────

      const srRate = parseBestRate(srRateRaw) || (rate + 0.5);
      const tenure = parseTenureDays(tenureRaw) || 365;
      const minAmt = parseMinAmount(amtRaw);
      const applyUrl = $(row).find('a').first().attr('href') || usedUrl;

      fds.push({
        bankName,
        schemeName:      `${bankName} FD ${Math.round(tenure / 30)} Months`,
        minTenure:       tenure,
        maxTenure:       tenure,
        interestRate:    rate,
        seniorRate:      srRate > rate ? srRate : rate + 0.5,
        minAmount:       minAmt,
        lastUpdatedDate: new Date().toISOString().split('T')[0],
        source:          'paisabazaar_fd',
        applyUrl:        applyUrl.startsWith('http') ? applyUrl : `https://www.paisabazaar.com${applyUrl}`,
      });
    });
  });

  // Card/product div fallback
  if (fds.length < 3) {
    $('[class*="fd-card"], [class*="FdCard"], [class*="product-card"], [class*="bank-card"], [class*="fdCard"], [class*="offerCard"]').each((_, el) => {
      const $el     = $(el);
      const bankRaw = $el.find('[class*="bank"], [class*="name"], h2, h3, h4').first().text().trim();
      const rateRaw = $el.find('[class*="rate"], [class*="interest"], [class*="Rate"]').first().text().trim();
      const srRaw   = $el.find('[class*="senior"], [class*="Senior"]').first().text().trim();
      const tenureRaw = $el.find('[class*="tenure"], [class*="period"], [class*="duration"]').first().text().trim();
      const amtRaw  = $el.find('[class*="amount"], [class*="Amount"], [class*="min"]').first().text().trim();

      if (!bankRaw || !rateRaw) return;

      const bankName = canonicalBankName(bankRaw);
      const rate     = parseBestRate(rateRaw);
      if (!rate) return;

      // ── VALIDATION ──────────────────────────────────────────────────
      if (!isValidFD(bankName, rate)) return;
      // ────────────────────────────────────────────────────────────────

      const tenure = parseTenureDays(tenureRaw) || 365;
      fds.push({
        bankName,
        schemeName:      `${bankName} FD 1 Year`,
        minTenure:       tenure,
        maxTenure:       tenure,
        interestRate:    rate,
        seniorRate:      parseBestRate(srRaw) || (rate + 0.5),
        minAmount:       parseMinAmount(amtRaw),
        lastUpdatedDate: new Date().toISOString().split('T')[0],
        source:          'paisabazaar_fd',
        applyUrl:        usedUrl,
      });
    });
  }

  console.log(`  📊 [Paisabazaar-FD] ${fds.length} FD records parsed`);
  return fds;
}

// ── Deduplication ──────────────────────────────────────────────────────────────

function deduplicateFDs(fds) {
  const seen = new Map();
  for (const fd of fds) {
    const tenureBucket = Math.round((fd.minTenure || 365) / 90) * 90;
    const key = `${slugify(fd.bankName)}|${tenureBucket}`;
    if (!key || key === '|0') continue;
    if (!seen.has(key) || fd.interestRate > seen.get(key).interestRate) {
      seen.set(key, fd);
    }
  }
  return Array.from(seen.values());
}

// ── Main Export ────────────────────────────────────────────────────────────────

/**
 * Sources (in order):
 *   1. BankBazaar FD  — 10s timeout, plain HTML, replaces Groww
 *   2. Paisabazaar FD — 10s timeout, plain HTML, replaces MyLoanCare FD
 *
 * RBI deposit rates (73 records) are merged later in fdScraper.js — untouched.
 */
async function scrapeFDSourcesLive() {
  const allFDs = [];
  const sourceBreakdown = {};
  const errors = [];

  const sources = [
    { name: 'BankBazaar-FD',  fn: scrapeBankBazaarFD  },
    { name: 'Paisabazaar-FD', fn: scrapePaisabazaarFD  },
  ];

  for (const src of sources) {
    try {
      const fds   = await src.fn();
      const valid = fds.filter(f => f.bankName && f.interestRate > 0);
      sourceBreakdown[src.name] = valid.length;
      allFDs.push(...valid);

      if (valid.length > 0) {
        console.log(`  ✅ [FDLive] ${src.name}: ${valid.length} FD records`);
      } else {
        console.log(`  ⚠️  [FDLive] ${src.name}: 0 valid FDs (site structure may differ)`);
      }
    } catch (err) {
      const msg = `${src.name}: ${err.message}`;
      errors.push(msg);
      console.log(`  ❌ [FDLive] ${msg}`);
      sourceBreakdown[src.name] = 0;
    }
  }

  const deduped = deduplicateFDs(allFDs);

  return {
    fds:             deduped,
    count:           deduped.length,
    sourceBreakdown,
    errors,
  };
}

module.exports = { scrapeFDSourcesLive };
