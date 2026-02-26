import { logger } from '@screener/shared';
import { USER_AGENTS, SCRAPER_CONFIG } from '../config.js';

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export class BlockedError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(`Blocked with status ${statusCode}`);
    this.name = 'BlockedError';
  }
}

export class CaptchaError extends Error {
  constructor(public readonly body: string) {
    super('CAPTCHA detected');
    this.name = 'CaptchaError';
  }
}

export async function fetchPage(url: string): Promise<string> {
  const ua = pickRandom(USER_AGENTS);

  logger.debug(`Fetching: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': SCRAPER_CONFIG.baseUrl + '/',
      'DNT': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
  });

  const html = await response.text();

  // Detect blocking
  if (response.status === 403) {
    throw new BlockedError(403, html);
  }
  if (response.status === 429) {
    throw new BlockedError(429, html);
  }
  if (response.status === 503) {
    throw new BlockedError(503, html);
  }
  if (html.includes('cf-challenge') || html.includes('captcha-container')) {
    throw new CaptchaError(html);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return html;
}

export async function fetchJSON<T>(url: string): Promise<T> {
  const ua = pickRandom(USER_AGENTS);

  logger.debug(`Fetching JSON: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': ua,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': SCRAPER_CONFIG.baseUrl + '/',
      'X-Requested-With': 'XMLHttpRequest',
    },
    redirect: 'follow',
  });

  if (response.status === 403 || response.status === 429) {
    const body = await response.text();
    throw new BlockedError(response.status, body);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
