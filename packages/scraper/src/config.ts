export const SCRAPER_CONFIG = {
  // Timing (milliseconds)
  minDelayBetweenPages: 2000,
  maxDelayBetweenPages: 8000,
  batchSize: 50,
  minBatchBreak: 180_000,   // 3 min
  maxBatchBreak: 480_000,   // 8 min
  sessionMaxRequests: 300,
  minSessionBreak: 300_000,  // 5 min
  maxSessionBreak: 900_000,  // 15 min

  // Retry
  maxRetriesPerPage: 3,
  retryBaseDelay: 30_000,    // 30 seconds, doubles each retry
  captchaBackoff: 3_600_000, // 1 hour
  blockBackoff: 3_600_000,   // 1 hour

  // Blocking detection
  maxConsecutiveFailures: 10, // Switch to Playwright fallback after this

  // URLs
  baseUrl: 'https://www.screener.in',
  searchApiPath: '/api/company/search/',
  companyPath: '/company/',
} as const;

export const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0',
];
