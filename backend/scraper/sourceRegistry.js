'use strict';

/**
 * sourceRegistry.js — FINAL STABLE CONFIGURATION
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  PRIMARY DATA SOURCE: fallbackCards.json (50 curated cards)     ║
 * ║  LIVE SUPPLEMENT:     CardInsider only (axios, no JS required)   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Why CardInsider ONLY and not Paisabazaar/BankBazaar?
 *   ✅ CardInsider  → listing page has INDIVIDUAL card entries with real names,
 *                     fees (₹500), cashback % (5%), and working apply links.
 *                     Confirmed returning: Flipkart Axis, Cashback SBI, HDFC
 *                     Millennia, IDFC Classic, AU LIT, EazyDiner IndusInd.
 *
 *   ❌ Paisabazaar  → listing page serves CATEGORY-LEVEL links only:
 *                     "HDFC Credit Cards", "Axis Bank Credit Cards" etc.
 *                     Individual card data requires JavaScript rendering.
 *
 *   ❌ BankBazaar   → same — their listing page is navigation-only at HTTP level.
 *                     Individual card data requires JavaScript rendering.
 *
 *   ❌ Official Bank Websites (HDFC, SBI, ICICI, Axis, etc.)
 *                  → All protected by Cloudflare/Akamai WAF.
 *                     Cannot be scraped headlessly without paid residential proxies.
 *
 * All accurate card data is served from fallbackCards.json (50 real cards).
 */

/** @type {Array<{id, name, url, strategy, parser, enabled}>} */
const SOURCES = [
  // ── CardInsider ─ VERIFIED: Returns real individual card data via plain HTTP ──
  {
    id:       'cardinsider',
    name:     'CardInsider',
    url:      'https://www.cardinsider.com/credit-cards/',
    strategy: 'axios',
    parser:   'parseCardInsider',
    enabled:  true,
  },

  // ── Paisabazaar ─ DISABLED: Only returns category links, not individual cards ──
  {
    id:       'paisabazaar',
    name:     'Paisabazaar',
    url:      'https://www.paisabazaar.com/credit-card/',
    strategy: 'axios',
    parser:   'parsePaisabazaar',
    enabled:  false,
  },

  // ── BankBazaar ─ DISABLED: Only returns category links, not individual cards ──
  {
    id:       'bankbazaar',
    name:     'BankBazaar',
    url:      'https://www.bankbazaar.com/credit-card.html',
    strategy: 'axios',
    parser:   'parseBankBazaar',
    enabled:  false,
  },
];

module.exports = { SOURCES };
