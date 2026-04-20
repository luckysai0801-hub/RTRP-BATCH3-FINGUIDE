/**
 * scraper/engine/parserRegistry.js
 * Maps source id strings → parser functions.
 * Importing all parsers in one place keeps the orchestrator clean.
 */

'use strict';

const { parseHdfc, parseSbiCard, parseIcici, parseAxis, parseIdfc, parseAuBank } = require('../parsers/bankParsers');
const { parseBankBazaar, parsePaisabazaar, parseCardInsider } = require('../parsers/aggregatorParsers');

/**
 * @type {Record<string, (html: string) => Object[]>}
 */
const PARSER_REGISTRY = {
  parseHdfc,
  parseSbiCard,
  parseIcici,
  parseAxis,
  parseIdfc,
  parseAuBank,
  parseBankBazaar,
  parsePaisabazaar,
  parseCardInsider,
};

/**
 * Resolve a parser name to its function.
 * @param {string} parserName
 * @returns {(html: string) => Object[]}
 */
function getParser(parserName) {
  const fn = PARSER_REGISTRY[parserName];
  if (!fn) throw new Error(`No parser registered for '${parserName}'`);
  return fn;
}

module.exports = { getParser, PARSER_REGISTRY };
