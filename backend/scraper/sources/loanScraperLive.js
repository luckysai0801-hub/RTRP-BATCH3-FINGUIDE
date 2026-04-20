/**
 * scraper/sources/loanScraperLive.js (v3 — MyLoanCare removed, Paisabazaar added)
 *
 * TIER 2 — Live Personal Loan Aggregator Scraper
 * ══════════════════════════════════════════════════════════════════════
 * CHANGES in v3:
 *   - MyLoanCare REMOVED — was timing out every run (60+ seconds wasted).
 *   - Deal4Loans: added strict loan validation guard before pushing any
 *     record — rejects "Loan Amount", "EMI Calculator", etc.
 *   - Paisabazaar Personal Loans ADDED (10s timeout, replaces MyLoanCare)
 *   - BankBazaar: unchanged ✅ (17 loans working)
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

// ── HTTP Helper ────────────────────────────────────────────────────────────────

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

/** Try URL list, return first that succeeds */
async function fetchFirstWorking(urls, referer, timeout) {
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

// ── Shared Parsers ─────────────────────────────────────────────────────────────

function parseRateRange(str) {
  if (!str) return null;
  const clean = String(str).replace(/[%p\.a\s]/gi, ' ').trim();

  const rangeMatch = clean.match(/(\d+\.?\d*)\s*[-–to]+\s*(\d+\.?\d*)/);
  if (rangeMatch) {
    const minRate = parseFloat(rangeMatch[1]);
    const maxRate = parseFloat(rangeMatch[2]);
    if (minRate >= 1 && maxRate >= minRate && maxRate <= 50) {
      return { minRate, maxRate, rate: minRate };
    }
  }

  const singleMatch = clean.match(/(\d+\.?\d*)/);
  if (singleMatch) {
    const rate = parseFloat(singleMatch[1]);
    if (rate >= 1 && rate <= 50) {
      return { minRate: rate, maxRate: rate, rate };
    }
  }

  return null;
}

function parseProcessingFee(str) {
  if (!str) return 2.0;
  const s = String(str).toLowerCase();
  if (/nil|free|zero|waived|no fee/i.test(s)) return 0;
  const m = s.match(/(\d+\.?\d*)/);
  if (!m) return 2.0;
  const val = parseFloat(m[1]);
  if (val > 10) return 0;
  return val;
}

function parseAmount(str) {
  if (!str) return null;
  const s = String(str).toLowerCase().replace(/,/g, '');
  const lakhMatch = s.match(/(\d+\.?\d*)\s*lakh/);
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]) * 100000);
  const croreMatch = s.match(/(\d+\.?\d*)\s*crore/);
  if (croreMatch) return Math.round(parseFloat(croreMatch[1]) * 10000000);
  const num = s.match(/(\d{4,})/);
  if (num) return parseInt(num[1], 10);
  return null;
}

// ── Deal4Loans Loan Validation ─────────────────────────────────────────────────
//
// Rejects "Loan Amount", "Loan Tenure", "SBI Personal Loan EMI Calculator" etc.

const LOAN_KEYWORDS = ['loan', 'credit', 'finance'];

const LOAN_REJECT_PHRASES = [
  'emi calculator', 'rate of interest', 'how to', 'what is',
  'calculator', 'eligibility calculator', 'emi calc',
];

const KNOWN_BANKS = [
  // Private banks
  'hdfc', 'icici', 'axis', 'kotak', 'yes bank', 'indusind', 'idfc', 'rbl',
  'federal', 'au ', 'au small', 'standard chartered', 'hsbc', 'citibank', 'citi',
  'karnataka bank', 'city union', 'dhanlaxmi', 'karur vysya', 'south indian bank',
  // PSU banks
  'sbi', 'pnb', 'punjab national', 'baroda', 'bank of baroda', 'canara',
  'union bank', 'bank of india', 'bank of maharashtra', 'central bank',
  'indian bank', 'indian overseas', 'uco', 'punjab & sind', 'punjab and sind',
  'idbi', 'allahabad', 'andhra bank', 'syndicate', 'united bank',
  // NBFCs & fintechs
  'tata', 'bajaj', 'fullerton', 'muthoot', 'iifl', 'hero', 'aditya birla',
  'l&t', 'piramal', 'home credit', 'incred', 'lendingkart', 'capital first',
  'cholamandalam', 'chola', 'hdb financial', 'hdbfs', 'mahindra finance',
  'mannapuram', 'moneyview', 'poonawalla', 'shriram', 'navi', 'cashe',
  'kreditbee', 'loantap', 'early salary', 'fibe', 'prefr',
];

/**
 * Returns true if this loan record is valid (not garbage content).
 * @param {string} loanName  — raw name from scraper
 * @param {string} bankName  — resolved canonical bank name
 * @param {number} rate      — interest rate %
 */
function isValidLoan(loanName, bankName, rate) {
  if (!loanName || typeof loanName !== 'string') return false;
  const name = loanName.toLowerCase().trim();
  const bank = (bankName || '').toLowerCase().trim();

  // Must contain a loan keyword
  const hasKeyword = LOAN_KEYWORDS.some(kw => name.includes(kw));
  if (!hasKeyword) {
    console.log(`    [Deal4Loans-Loan] REJECT (no keyword): "${loanName}"`);
    return false;
  }

  // Must NOT contain rejected phrases
  for (const phrase of LOAN_REJECT_PHRASES) {
    if (name.includes(phrase.toLowerCase())) {
      console.log(`    [Deal4Loans-Loan] REJECT (phrase "${phrase}"): "${loanName}"`);
      return false;
    }
  }

  // Interest rate must be between 6% and 40%
  if (typeof rate === 'number' && (rate < 6 || rate > 40)) {
    console.log(`    [Deal4Loans-Loan] REJECT (rate ${rate}% out of range): "${loanName}"`);
    return false;
  }

  // Bank name check (if bank name is present and long enough)
  if (bank && bank.length >= 3) {
    const knownBank = KNOWN_BANKS.some(kb => bank.includes(kb));
    if (!knownBank) {
      console.log(`    [Deal4Loans-Loan] REJECT (unknown bank "${bankName}"): "${loanName}"`);
      return false;
    }
  }

  return true;
}

// ── Source 1: Paisabazaar Personal Loans (REPLACES MyLoanCare) ────────────────
// 10-second timeout only — no retries to keep total runtime fast.

async function scrapePaisabazaarLoans() {
  const PB_URLS = [
    'https://www.paisabazaar.com/personal-loan/',
    'https://www.paisabazaar.com/personal-loan/interest-rate/',
  ];

  let html, usedUrl;
  try {
    ({ html, url: usedUrl } = await fetchFirstWorking(PB_URLS, 'https://www.paisabazaar.com/', 10000));
    console.log(`  ↳ [Paisabazaar-Loans] Loaded from: ${usedUrl}`);
  } catch (err) {
    throw new Error(`Paisabazaar-Loans: all URLs failed — ${err.message}`);
  }

  debugHtml('Paisabazaar-Loans', html, 200);

  const $     = cheerio.load(html);
  const loans = [];

  // Primary: comparison table rows
  $('table').each((_, tbl) => {
    $(tbl).find('tr').each((rowIdx, row) => {
      if (rowIdx === 0) return; // skip header
      const cells = $(row).find('td').toArray().map(c => $(c).text().trim());
      if (cells.length < 2) return;

      const bankRaw = cells[0];
      if (!bankRaw || bankRaw.length < 3 || /^(bank|lender|sl|#)$/i.test(bankRaw)) return;

      const rateStr  = cells[1] || cells[2] || '';
      const parsedR  = parseRateRange(rateStr);
      if (!parsedR) return;

      // Validate: rate between 6% and 36%
      if (parsedR.minRate < 6 || parsedR.minRate > 36) return;

      const bankName = canonicalBankName(bankRaw);

      // Validate: must be known bank
      const bankLower = bankName.toLowerCase();
      const isKnown   = KNOWN_BANKS.some(kb => bankLower.includes(kb));
      if (!isKnown) {
        console.log(`    [Paisabazaar-Loans] Skipping unknown bank: "${bankName}"`);
        return;
      }

      const procFee = parseProcessingFee(cells[3] || cells[2] || '');
      const maxAmt  = parseAmount(cells[4] || cells[3] || '') || 4000000;
      const applyHref = $(row).find('a').first().attr('href') || usedUrl;

      loans.push({
        bankName,
        loanName:      `${bankName} Personal Loan`,
        loanType:      'personal',
        minRate:       parsedR.minRate,
        maxRate:       parsedR.maxRate,
        interestRate:  parsedR.minRate,
        processingFee: procFee,
        minTenure:     12,
        maxTenure:     60,
        minAmount:     50000,
        maxAmount:     maxAmt,
        applyUrl:      applyHref.startsWith('http') ? applyHref : `https://www.paisabazaar.com${applyHref}`,
        source:        'paisabazaar',
      });
    });
  });

  // Fallback: card/product divs
  if (loans.length < 3) {
    $('[class*="product"], [class*="loanCard"], [class*="LoanCard"], [class*="bank-item"], [class*="BankCard"], [class*="offerCard"]').each((_, el) => {
      const $el     = $(el);
      const bankRaw = $el.find('[class*="bank"], [class*="name"], h2, h3, h4').first().text().trim();
      const rateRaw = $el.find('[class*="interest"], [class*="rate"], [class*="apr"], [class*="Rate"]').first().text().trim();
      if (!bankRaw || !rateRaw) return;
      const parsedR = parseRateRange(rateRaw);
      if (!parsedR) return;
      if (parsedR.minRate < 6 || parsedR.minRate > 36) return;

      const bankName = canonicalBankName(bankRaw);
      const bankLower = bankName.toLowerCase();
      const isKnown   = KNOWN_BANKS.some(kb => bankLower.includes(kb));
      if (!isKnown) return;

      loans.push({
        bankName,
        loanName:      `${bankName} Personal Loan`,
        loanType:      'personal',
        minRate:       parsedR.minRate,
        maxRate:       parsedR.maxRate,
        interestRate:  parsedR.minRate,
        processingFee: 2.0,
        minTenure:     12,
        maxTenure:     60,
        minAmount:     50000,
        maxAmount:     4000000,
        applyUrl:      usedUrl,
        source:        'paisabazaar',
      });
    });
  }

  console.log(`  📊 [Paisabazaar-Loans] ${loans.length} loans parsed`);
  return loans;
}

// ── Source 2: Deal4Loans ──────────────────────────────────────────────────────
// v3 FIX: isValidLoan() guard added on every push.

async function scrapeDeal4Loans() {
  const url  = 'https://www.deal4loans.com/loans/personal-loan-interest-rates/';
  const html = await fetchPage(url, 'https://www.deal4loans.com/', 15000);
  const $    = cheerio.load(html);
  const loans = [];

  debugHtml('Deal4Loans-Loans', html, 300);

  const TABLE_SELECTORS = [
    'table.rate-table',
    '.loan-listing table',
    '.comparison-table',
    '.rate-comparison table',
    'table',
  ];

  for (const tblSel of TABLE_SELECTORS) {
    let foundInThisSel = 0;
    $(tblSel).each((_, tbl) => {
      $(tbl).find('tr, tbody tr').each((rowIdx, row) => {
        if (rowIdx === 0) return;
        const cells = $(row).find('td').toArray().map(c => $(c).text().trim());
        if (cells.length < 2) return;

        const bankRaw = cells[0];
        if (!bankRaw || bankRaw.length < 3 || /^(bank|lender|no\.|#|\d+\.?)$/i.test(bankRaw)) return;

        const rateStr = cells[1] || cells[2] || '';
        const parsedR = parseRateRange(rateStr);
        if (!parsedR) return;

        const bankName = canonicalBankName(bankRaw);
        // Build a candidate loan name to validate
        const candidateName = `${bankName} Personal Loan`;

        // ── v3 VALIDATION GUARD ───────────────────────────────────────────
        if (!isValidLoan(candidateName, bankName, parsedR.minRate)) return;
        // ─────────────────────────────────────────────────────────────────

        const procFee   = parseProcessingFee(cells[2] || cells[3] || '');
        const maxAmt    = parseAmount(cells[4] || cells[3] || '') || 3000000;
        const tenureRaw = cells[3] || cells[4] || '';
        const tenureMatch = tenureRaw.match(/(\d+)/);
        const maxTenure = tenureMatch ? parseInt(tenureMatch[1], 10) : 60;
        const applyHref = $(row).find('a').first().attr('href') || url;

        loans.push({
          bankName,
          loanName:      `${bankName} Personal Loan`,
          loanType:      'personal',
          minRate:       parsedR.minRate,
          maxRate:       parsedR.maxRate,
          interestRate:  parsedR.minRate,
          processingFee: procFee,
          minTenure:     6,
          maxTenure:     Math.min(Math.max(maxTenure, 12), 84),
          minAmount:     50000,
          maxAmount:     maxAmt,
          applyUrl:      applyHref.startsWith('http') ? applyHref : `https://www.deal4loans.com${applyHref}`,
          source:        'deal4loans',
        });
        foundInThisSel++;
      });
    });
    if (foundInThisSel > 0) break;
  }

  // Div-based rows fallback with validation
  if (loans.length < 3) {
    $('[class*="bank-row"], [class*="loan-row"], [class*="loanRow"], [class*="bank-item"]').each((_, el) => {
      const $el     = $(el);
      const bankRaw = $el.find('[class*="bank"], h3, h4, td:first-child').first().text().trim();
      const rateRaw = $el.find('[class*="rate"], [class*="interest"], td:nth-child(2)').first().text().trim();
      if (!bankRaw || !rateRaw) return;
      const parsedR = parseRateRange(rateRaw);
      if (!parsedR) return;

      const bankName      = canonicalBankName(bankRaw);
      const candidateName = `${bankName} Personal Loan`;

      // ── v3 VALIDATION GUARD ───────────────────────────────────────────
      if (!isValidLoan(candidateName, bankName, parsedR.minRate)) return;
      // ─────────────────────────────────────────────────────────────────

      loans.push({
        bankName,
        loanName:      `${bankName} Personal Loan`,
        loanType:      'personal',
        minRate:       parsedR.minRate,
        maxRate:       parsedR.maxRate,
        interestRate:  parsedR.minRate,
        processingFee: 2.0,
        minTenure:     12,
        maxTenure:     60,
        minAmount:     50000,
        maxAmount:     3000000,
        applyUrl:      url,
        source:        'deal4loans',
      });
    });
  }

  console.log(`  🏦 [Deal4Loans-Loans] ${loans.length} loans passed validation`);
  return loans;
}

// ── Source 3: BankBazaar ──────────────────────────────────────────────────────
// Unchanged ✅ — verified working (17 loans)

async function scrapeBankBazaar() {
  const url  = 'https://www.bankbazaar.com/personal-loan.html';
  const html = await fetchPage(url, 'https://www.bankbazaar.com/', 15000);
  const $    = cheerio.load(html);
  const loans = [];

  debugHtml('BankBazaar-Loans', html, 200);

  $('table').each((_, tbl) => {
    $(tbl).find('tr').each((rowIdx, row) => {
      if (rowIdx === 0) return;
      const cells = $(row).find('td').toArray().map(c => $(c).text().trim());
      if (cells.length < 2) return;

      const bankRaw = cells[0];
      if (!bankRaw || bankRaw.length < 3) return;

      // Skip garbage / header rows
      if (/^(loan amount|loan tenure|processing fee|bank|lender|sl|#|\d+\.?)/i.test(bankRaw.trim())) return;

      // Strip trailing loan-type label BankBazaar embeds in the bank name cell
      const cleanBank = bankRaw
        .replace(/\s*(personal loan|home loan|business loan|vehicle loan|car loan)\s*$/i, '')
        .trim();
      if (!cleanBank || cleanBank.length < 3) return;

      const rateStr = cells[1] || '';
      const parsedR = parseRateRange(rateStr);
      if (!parsedR) return;

      const procFee = parseProcessingFee(cells[2] || '');
      const maxAmt  = parseAmount(cells[3] || '') || 4000000;
      loans.push({
        bankName:      canonicalBankName(cleanBank),
        loanName:      `${canonicalBankName(cleanBank)} Personal Loan`,
        loanType:      'personal',
        minRate:       parsedR.minRate,
        maxRate:       parsedR.maxRate,
        interestRate:  parsedR.minRate,
        processingFee: procFee,
        minTenure:     6,
        maxTenure:     60,
        minAmount:     50000,
        maxAmount:     maxAmt,
        applyUrl:      url,
        source:        'bankbazaar',
      });
    });
  });

  if (loans.length < 3) {
    $('[class*="product"], [class*="loanCard"], [class*="LoanCard"], [class*="bank-item"]').each((_, el) => {
      const $el     = $(el);
      const bankRaw = $el.find('[class*="bank"], [class*="name"], h2, h3').first().text().trim();
      const rateRaw = $el.find('[class*="interest"], [class*="rate"], [class*="apr"]').first().text().trim();
      if (!bankRaw || !rateRaw) return;
      const parsedR = parseRateRange(rateRaw);
      if (!parsedR) return;

      loans.push({
        bankName:      canonicalBankName(bankRaw),
        loanName:      `${canonicalBankName(bankRaw)} Personal Loan`,
        loanType:      'personal',
        minRate:       parsedR.minRate,
        maxRate:       parsedR.maxRate,
        interestRate:  parsedR.minRate,
        processingFee: 2.0,
        minTenure:     12,
        maxTenure:     60,
        minAmount:     50000,
        maxAmount:     4000000,
        applyUrl:      url,
        source:        'bankbazaar',
      });
    });
  }

  return loans;
}

// ── Deduplication ──────────────────────────────────────────────────────────────

function deduplicateLoans(loans) {
  const seen = new Map();
  for (const loan of loans) {
    const key = slugify(loan.bankName);
    if (!key) continue;
    if (!seen.has(key) || loan.minRate < seen.get(key).minRate) {
      seen.set(key, loan);
    }
  }
  return Array.from(seen.values());
}

// ── Main Export ────────────────────────────────────────────────────────────────

/**
 * Sources (in order):
 *   1. Paisabazaar  — 10s timeout, replaces MyLoanCare
 *   2. Deal4Loans   — 15s timeout, with validation guard
 *   3. BankBazaar   — 15s timeout, unchanged ✅
 */
async function scrapeLoanSourcesLive() {
  const allLoans = [];
  const sourceBreakdown = {};
  const errors = [];

  const sources = [
    { name: 'Paisabazaar', fn: scrapePaisabazaarLoans },
    { name: 'Deal4Loans',  fn: scrapeDeal4Loans       },
    { name: 'BankBazaar',  fn: scrapeBankBazaar        },
  ];

  for (const src of sources) {
    try {
      const loans = await src.fn();
      const valid  = loans.filter(l => l.bankName && l.interestRate > 0);
      sourceBreakdown[src.name] = valid.length;
      allLoans.push(...valid);

      if (valid.length > 0) {
        console.log(`  ✅ [LoanLive] ${src.name}: ${valid.length} loans`);
      } else {
        console.log(`  ⚠️  [LoanLive] ${src.name}: 0 valid loans (site structure may differ)`);
      }
    } catch (err) {
      const msg = `${src.name}: ${err.message}`;
      errors.push(msg);
      console.log(`  ❌ [LoanLive] ${msg}`);
      sourceBreakdown[src.name] = 0;
    }
  }

  const deduped = deduplicateLoans(allLoans);

  return {
    loans:           deduped,
    count:           deduped.length,
    sourceBreakdown,
    errors,
  };
}

module.exports = { scrapeLoanSourcesLive };
