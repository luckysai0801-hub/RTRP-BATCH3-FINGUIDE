/**
 * scraper/parsers/bankParsers.js
 * Source-specific parsers for OFFICIAL bank websites.
 * Each parser receives (html: string) and returns RawCard[].
 *
 * RawCard shape (pre-normalisation):
 *   { cardName, bankName, annualFee?, joiningFee?, interestRate?,
 *     cashback?, rewardsType?, rewardsDescription?, lounge?,
 *     network?, applyUrl?, source }
 */

'use strict';

const cheerio = require('cheerio');
const { parseINR, parseRate } = require('../utils/parsers');

// ── HDFC ──────────────────────────────────────────────────────────────────────
function parseHdfc(html) {
  const $ = cheerio.load(html);
  const cards = [];

  // HDFC renders cards inside product-card / card-item containers
  $(
    '.creditcard-item, .product-card, [class*="card-content"], ' +
    '[data-product-name], .personalcards-item'
  ).each((_, el) => {
    const $el = $(el);
    const cardName = (
      $el.find('.card-name, .product-name, h3, h4').first().text().trim() ||
      $el.attr('data-product-name') || ''
    );
    const fee = parseINR($el.find('[class*="fee"], [class*="annual"]').first().text());
    const applyLink = $el.find('a[href*="credit-card"]').first().attr('href') || '';
    if (cardName.length > 3) {
      cards.push({
        cardName,
        bankName: 'HDFC Bank',
        annualFee: fee,
        applyUrl: applyLink.startsWith('http') ? applyLink : `https://www.hdfcbank.com${applyLink}`,
        source: 'hdfc_official',
      });
    }
  });

  return cards;
}

// ── SBI Card ──────────────────────────────────────────────────────────────────
function parseSbiCard(html) {
  const $ = cheerio.load(html);
  const cards = [];

  $(
    '.card-block, .product-card, [class*="cardTile"], ' +
    '[class*="card-item"], .cc-listing-block'
  ).each((_, el) => {
    const $el = $(el);
    const cardName = $el.find('h2, h3, .card-name, [class*="cardName"]').first().text().trim();
    const fee = parseINR($el.find('[class*="fee"], [class*="annual"]').first().text());
    const applyLink = $el.find('a[href*="credit-card"], a[href*="sbi"]').first().attr('href') || '';
    if (cardName.length > 3) {
      cards.push({
        cardName,
        bankName: 'State Bank of India',
        annualFee: fee,
        applyUrl: applyLink.startsWith('http') ? applyLink : `https://www.sbicard.com${applyLink}`,
        source: 'sbicard_official',
      });
    }
  });

  return cards;
}

// ── ICICI ─────────────────────────────────────────────────────────────────────
function parseIcici(html) {
  const $ = cheerio.load(html);
  const cards = [];

  $(
    '[class*="card-list"] li, [class*="creditcard"] .item, ' +
    '.card-info, [class*="product-card"]'
  ).each((_, el) => {
    const $el = $(el);
    const cardName = $el.find('h2, h3, .title, [class*="card-name"]').first().text().trim();
    const fee = parseINR($el.find('[class*="fee"]').first().text());
    const applyLink = $el.find('a').first().attr('href') || '';
    if (cardName.length > 3) {
      cards.push({
        cardName,
        bankName: 'ICICI Bank',
        annualFee: fee,
        applyUrl: applyLink.startsWith('http') ? applyLink : `https://www.icicibank.com${applyLink}`,
        source: 'icici_official',
      });
    }
  });

  return cards;
}

// ── Axis Bank ─────────────────────────────────────────────────────────────────
function parseAxis(html) {
  const $ = cheerio.load(html);
  const cards = [];

  $(
    '.card-tile, .credit-card-tile, [class*="product-card"], ' +
    '[class*="cardList"] li, .offers-tile'
  ).each((_, el) => {
    const $el = $(el);
    const cardName = $el.find('h2, h3, .card-title, [class*="title"]').first().text().trim();
    const fee = parseINR($el.find('[class*="fee"], [class*="annual"]').first().text());
    const applyLink = $el.find('a[href*="credit-card"]').first().attr('href') || '';
    if (cardName.length > 3) {
      cards.push({
        cardName,
        bankName: 'Axis Bank',
        annualFee: fee,
        applyUrl: applyLink.startsWith('http') ? applyLink : `https://www.axisbank.com${applyLink}`,
        source: 'axis_official',
      });
    }
  });

  return cards;
}

// ── IDFC FIRST Bank ───────────────────────────────────────────────────────────
function parseIdfc(html) {
  const $ = cheerio.load(html);
  const cards = [];

  $(
    '[class*="card-wrapper"], [class*="product-item"], ' +
    '.credit-card-block, [class*="cc-block"]'
  ).each((_, el) => {
    const $el = $(el);
    const cardName = $el.find('h2, h3, .card-name, [class*="card-title"]').first().text().trim();
    const fee = parseINR($el.find('[class*="fee"]').first().text());
    const applyLink = $el.find('a').first().attr('href') || '';
    if (cardName.length > 3) {
      cards.push({
        cardName,
        bankName: 'IDFC First Bank',
        annualFee: fee,
        applyUrl: applyLink.startsWith('http') ? applyLink : `https://www.idfcfirstbank.com${applyLink}`,
        source: 'idfc_official',
      });
    }
  });

  return cards;
}

// ── AU Small Finance Bank ─────────────────────────────────────────────────────
function parseAuBank(html) {
  const $ = cheerio.load(html);
  const cards = [];

  $(
    '[class*="card-item"], .product-info, ' +
    '[class*="creditcard-block"], [class*="card-box"]'
  ).each((_, el) => {
    const $el = $(el);
    const cardName = $el.find('h2, h3, .card-title, [class*="title"]').first().text().trim();
    const fee = parseINR($el.find('[class*="fee"]').first().text());
    const applyLink = $el.find('a').first().attr('href') || '';
    if (cardName.length > 3) {
      cards.push({
        cardName,
        bankName: 'AU Small Finance Bank',
        annualFee: fee,
        applyUrl: applyLink.startsWith('http') ? applyLink : `https://www.aubank.in${applyLink}`,
        source: 'au_official',
      });
    }
  });

  return cards;
}

module.exports = { parseHdfc, parseSbiCard, parseIcici, parseAxis, parseIdfc, parseAuBank };
