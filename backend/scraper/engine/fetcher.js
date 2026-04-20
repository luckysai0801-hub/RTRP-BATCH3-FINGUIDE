
'use strict';

const axios = require('axios');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Fetch via axios (fast, static pages).
 * @param {string} url
 * @param {number} [timeout=15000]
 * @returns {Promise<string>} HTML
 */
async function fetchWithAxios(url, timeout = 15000) {
  const response = await axios.get(url, {
    timeout,
    headers: {
      'User-Agent': randomUA(),
      'Accept-Language': 'en-IN,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://www.google.com/',
      'Cache-Control': 'no-cache',
    },
    maxRedirects: 5,
  });
  return response.data;
}

/**
 * Fetch via Playwright headless Chromium (JS-heavy pages).
 *
 * KEY FIXES vs old version:
 *  - waitUntil: 'domcontentloaded'  ← bank sites NEVER reach networkidle
 *  - 60 s timeout (was 30 s)
 *  - stealth headers to reduce bot-detection blocks
 *  - broader resource blocking (ads/trackers cause endless network activity)
 *  - automatic 1-retry on timeout
 *
 * @param {string} url
 * @param {number} [timeoutMs=60000]
 * @returns {Promise<string>} HTML after JS execution
 */
async function fetchWithPlaywright(url, timeoutMs = 60000) {
  // Lazy-require so servers without playwright don't crash
  let chromium, playwright;
  try {
    playwright = require('playwright');
    chromium   = playwright.chromium;
  } catch {
    throw new Error('playwright is not installed. Run: npm install playwright && npx playwright install chromium');
  }

  const ua = randomUA();

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
  });

  const _attempt = async () => {
    const context = await browser.newContext({
      userAgent: ua,
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      extraHTTPHeaders: {
        'Accept-Language': 'en-IN,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
        'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'cross-site',
        'upgrade-insecure-requests': '1',
      },
      viewport: { width: 1280, height: 900 },
    });

    // Block all non-essential resources — this is the #1 reason sites stay
    // busy forever: ads, analytics, and fonts keep making XHR calls endlessly.
    await context.route(/\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|eot|mp4|mp3)$/i, r => r.abort());
    await context.route(/\/\/(ads|analytics|gtm|googletagmanager|facebook|doubleclick|hotjar|clarity|mixpanel|segment|intercom|crisp|tawk|zopim|livechat|cdn-cgi\/rum)/, r => r.abort());

    const page = await context.newPage();

    // Hide webdriver property — basic anti-bot measure
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // ── CRITICAL FIX: use 'domcontentloaded', NOT 'networkidle' ──────────────
    // 'networkidle' waits for 500ms with <2 active connections — bank sites
    // always have background ad/analytics pings, so this never resolves.
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });

    // Fixed wait for JS-rendered card content to appear
    await page.waitForTimeout(3000);

    // Scroll to trigger lazy-loads
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1500);

    const html = await page.content();
    await context.close();
    return html;
  };

  try {
    return await _attempt();
  } catch (err) {
    // One automatic retry on timeout
    if (err.message && err.message.includes('Timeout')) {
      console.warn(`  [Fetcher] Timeout on first attempt for ${url} — retrying once…`);
      try {
        return await _attempt();
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Dispatch to the correct fetcher based on strategy.
 * @param {import('../sourceRegistry').SourceDefinition} source
 * @returns {Promise<string>} HTML
 */
async function fetchSource(source) {
  const { url, strategy, name } = source;
  console.log(`  [Fetcher] ${name} — ${strategy.toUpperCase()} → ${url}`);
  if (strategy === 'playwright') {
    return fetchWithPlaywright(url);
  }
  return fetchWithAxios(url);
}

module.exports = { fetchSource, fetchWithAxios, fetchWithPlaywright };
