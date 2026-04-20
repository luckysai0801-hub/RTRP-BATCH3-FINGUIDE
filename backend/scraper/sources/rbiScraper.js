/**
 * scraper/sources/rbiScraper.js
 *
 * TIER 1 — RBI Public Data Scraper
 * ══════════════════════════════════════════════════════════════════════
 * Scrapes FREE public RBI sources (no auth, no bot protection):
 *   1. RBI Benchmark Lending Rates table
 *   2. RBI Bank-wise Deposit Rates publication
 *
 * Returns: Array of { bankName, rate, rateType, effectiveDate }
 * Maps bank names via canonicalBankName() before returning.
 * ══════════════════════════════════════════════════════════════════════
 */

'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');
const { canonicalBankName } = require('../utils/normalizer');

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 15000;

const RBI_SOURCES = [
  {
    id:       'rbi_lending_rates',
    name:     'RBI Benchmark Lending Rates',
    url:      'https://www.rbi.org.in/Scripts/bs_viewcontent.aspx?Id=2009',
    rateType: 'lending',
  },
  {
    id:       'rbi_deposit_rates',
    name:     'RBI Bank-wise Deposit Rates',
    url:      'https://www.rbi.org.in/Scripts/PublicationsView.aspx?id=22173',
    rateType: 'deposit',
  },
];

const RBI_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
];

function randomUA() {
  return RBI_USER_AGENTS[Math.floor(Math.random() * RBI_USER_AGENTS.length)];
}

// ── HTTP Fetch ─────────────────────────────────────────────────────────────────

async function fetchRBI(url) {
  const response = await axios.get(url, {
    timeout: TIMEOUT_MS,
    headers: {
      'User-Agent':      randomUA(),
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer':         'https://www.rbi.org.in/',
      'Cache-Control':   'no-cache',
    },
  });
  return response.data;
}

// ── Rate Parsers ───────────────────────────────────────────────────────────────

/**
 * Extract interest rate (first numeric float) from a cell string.
 * Handles: "8.50%", "8.50 - 9.00", "8.50 to 9.25", etc.
 * Returns null if nothing usable found.
 */
function extractRate(str) {
  if (!str) return null;
  const clean = String(str).replace(/[%,\s]/g, '');
  // Range: take the first number
  const match = clean.match(/(\d+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  // Reject clearly invalid values
  if (val < 0.5 || val > 40) return null;
  return val;
}

/**
 * Try to extract a date from a string like "01-Jan-2024" or "2024-01-01".
 */
function extractDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  // DD-Mon-YYYY
  const m1 = s.match(/(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})/);
  if (m1) {
    const d = new Date(`${m1[2]} ${m1[1]}, ${m1[3]}`);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  // YYYY-MM-DD
  const m2 = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return s.slice(0, 10);
  return null;
}

// ── Indian States Blocklist ────────────────────────────────────────────────────
// RBI sometimes links to CPI-by-state publications. We need to skip rows where
// the first column is an Indian state/UT name rather than a bank name.

const INDIAN_STATES = new Set([
  'andaman & nicobar islands', 'andaman nicobar islands', 'andhra pradesh', 'assam',
  'bihar', 'chandigarh', 'chhattisgarh', 'dadra & nagar haveli', 'dadra nagar haveli',
  'daman & diu', 'daman diu', 'delhi', 'goa', 'gujarat', 'haryana', 'himachal pradesh',
  'jammu & kashmir', 'jammu kashmir', 'jharkhand', 'karnataka', 'kerala', 'lakshadweep',
  'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland',
  'odisha', 'puducherry', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana',
  'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal', 'all india',
  'arunachal pradesh', 'ladakh', 'jammu', 'kashmir',
]);

// ── HTML Table Parser ──────────────────────────────────────────────────────────

/**
 * Generic HTML table parser for RBI pages.
 * RBI uses standard <table> → <tr> → <td> structures.
 *
 * Heuristics:
 *  - Column 0 (or 1) = Bank Name
 *  - Any column with a "%" value or a decimal between 2–30 = rate
 *  - Any column with a date pattern = effectiveDate
 *
 * @param {string} html
 * @param {string} rateType  'lending' | 'deposit'
 * @returns {Array<{bankName, rate, rateType, effectiveDate}>}
 */
function parseRBITable(html, rateType) {
  const $ = cheerio.load(html);
  const results = [];

  $('table').each((tblIdx, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length < 2) return; // skip empty/header-only tables

    // Detect header row to understand column layout
    let headerRow = rows[0];
    const headerCells = $(headerRow).find('th, td').toArray().map(c => $(c).text().trim().toLowerCase());

    // Find which column index is likely bank name, rate, date
    let bankCol = headerCells.findIndex(h => /bank|institution|lender/i.test(h));
    let rateCol = headerCells.findIndex(h => /rate|interest|yield/i.test(h));
    let dateCol = headerCells.findIndex(h => /date|effective|w\.e\.f|wef/i.test(h));

    // If no header found, try first data row
    if (bankCol === -1) bankCol = 0;
    if (rateCol === -1) rateCol = 1;

    // Process data rows (skip header)
    const dataRows = rows.slice(1);
    for (const row of dataRows) {
      const cells = $(row).find('td').toArray().map(c => $(c).text().trim());
      if (cells.length < 2) continue;

      const rawBank = cells[bankCol] || '';
      // Skip rows that are clearly section headers or empty
      if (!rawBank || rawBank.length < 3 || /^(sl\.?\s*no|s\.no|#)$/i.test(rawBank)) continue;
      // Skip if the text is massively long (happens when RBI tables are poorly formatted)
      if (rawBank.length > 80) continue;
      // Skip Indian state/UT names or CPI inflation headers
      const lowerBank = rawBank.toLowerCase().trim();
      if (INDIAN_STATES.has(lowerBank) || lowerBank.includes('state/union territory') || lowerBank.includes('cpi inflation')) continue;
      // Skip purely numeric first column (serial numbers)
      if (/^\d+\.?$/.test(rawBank.trim())) {
        // bank name might be in col 1
        const altBank = cells[1] || '';
        if (!altBank || altBank.length < 3) continue;
        const bankName = canonicalBankName(altBank);
        const rate = findRateInCells(cells, 2);
        const effectiveDate = dateCol >= 0 ? extractDate(cells[dateCol]) : findDateInCells(cells);
        if (rate && bankName) {
          results.push({ bankName, rate, rateType, effectiveDate });
        }
        continue;
      }

      const bankName = canonicalBankName(rawBank);
      const rate = findRateInCells(cells, rateCol);
      const effectiveDate = dateCol >= 0 ? extractDate(cells[dateCol]) : findDateInCells(cells);

      if (rate && bankName && bankName !== 'Unknown Bank') {
        results.push({ bankName, rate, rateType, effectiveDate });
      }
    }
  });

  return results;
}

/** Find a valid rate among cells starting at startCol */
function findRateInCells(cells, startCol) {
  for (let i = startCol; i < cells.length; i++) {
    const r = extractRate(cells[i]);
    if (r !== null) return r;
  }
  return null;
}

/** Find a date in any cell */
function findDateInCells(cells) {
  for (const cell of cells) {
    const d = extractDate(cell);
    if (d) return d;
  }
  return null;
}

// ── RBI Fallback Data ──────────────────────────────────────────────────────────
// Used when RBI pages are unavailable (maintenance windows etc.)

const RBI_FALLBACK_RATES = [
  { bankName: 'HDFC Bank',             rate: 9.10,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'State Bank of India',   rate: 8.50,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'ICICI Bank',            rate: 9.00,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'Axis Bank',             rate: 9.15,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'Kotak Mahindra Bank',   rate: 8.65,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'Punjab National Bank',  rate: 8.50,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'Bank of Baroda',        rate: 8.40,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'Canara Bank',           rate: 8.45,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'IndusInd Bank',         rate: 9.25,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'Yes Bank',              rate: 9.75,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'IDFC First Bank',       rate: 9.00,  rateType: 'lending', effectiveDate: '2024-10-01' },
  { bankName: 'Union Bank of India',   rate: 8.35,  rateType: 'lending', effectiveDate: '2024-10-01' },
  // Deposit rates
  { bankName: 'HDFC Bank',             rate: 7.10,  rateType: 'deposit', effectiveDate: '2024-10-01' },
  { bankName: 'State Bank of India',   rate: 6.80,  rateType: 'deposit', effectiveDate: '2024-10-01' },
  { bankName: 'ICICI Bank',            rate: 7.25,  rateType: 'deposit', effectiveDate: '2024-10-01' },
  { bankName: 'Axis Bank',             rate: 7.10,  rateType: 'deposit', effectiveDate: '2024-10-01' },
  { bankName: 'Kotak Mahindra Bank',   rate: 7.40,  rateType: 'deposit', effectiveDate: '2024-10-01' },
  { bankName: 'Punjab National Bank',  rate: 6.50,  rateType: 'deposit', effectiveDate: '2024-10-01' },
];

// ── Main Export ────────────────────────────────────────────────────────────────

/**
 * Scrape all RBI public sources.
 *
 * @returns {Promise<{
 *   data: Array<{bankName, rate, rateType, effectiveDate}>,
 *   count: number,
 *   usedFallback: boolean,
 *   sources: string[]
 * }>}
 */
async function scrapeRBI() {
  const all = [];
  const successSources = [];

  for (const src of RBI_SOURCES) {
    try {
      console.log(`  📡 [RBI] Fetching ${src.name}...`);
      const html    = await fetchRBI(src.url);
      const records = parseRBITable(html, src.rateType);

      if (records.length === 0) {
        console.log(`  ⚠️  [RBI] ${src.name}: parsed 0 records (page structure may have changed)`);
      } else {
        console.log(`  ✅ [RBI] ${src.name}: ${records.length} rate records`);
        all.push(...records);
        successSources.push(src.name);
      }
    } catch (err) {
      console.log(`  ❌ [RBI] ${src.name} failed: ${err.message}`);
    }
  }

  // If no live data → use fallback
  if (all.length === 0) {
    console.log('  ⚠️  [RBI] All sources failed — using embedded RBI fallback rates');
    return {
      data:         RBI_FALLBACK_RATES,
      count:        RBI_FALLBACK_RATES.length,
      usedFallback: true,
      sources:      [],
    };
  }

  // Deduplicate: per bankName + rateType, keep first seen (RBI lending > RBI deposit order)
  const seen = new Map();
  const deduped = [];
  for (const rec of all) {
    const key = `${rec.bankName}|${rec.rateType}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      deduped.push(rec);
    }
  }

  return {
    data:         deduped,
    count:        deduped.length,
    usedFallback: false,
    sources:      successSources,
  };
}

module.exports = { scrapeRBI };
