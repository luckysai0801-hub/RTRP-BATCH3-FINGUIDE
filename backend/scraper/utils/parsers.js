
'use strict';

/**
 * Parse an Indian Rupee string → integer.
 * Handles "₹2,500", "2500", "Nil", etc.
 */
function parseINR(str) {
  if (!str) return 0;
  const s = String(str).toLowerCase().trim();
  if (/nil|free|zero|waived/i.test(s)) return 0;
  const clean = s.replace(/[₹,\s]/g, '').replace(/lakh?s?/i, '00000');
  const n = parseInt(clean, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Extract the first numeric float from a string (used for interest rates).
 * Returns undefined if nothing found so callers can fall back gracefully.
 */
function parseRate(str) {
  const m = String(str || '').match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : undefined;
}

/**
 * Slugify a card / bank name for deduplication purposes.
 * Strips punctuation, lowercases, collapses whitespace.
 */
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { parseINR, parseRate, slugify };
