export type BlockingSignalType =
  | 'ip_blocked'
  | 'rate_limited'
  | 'captcha'
  | 'access_denied'
  | 'empty_response'
  | 'service_unavailable';

export type BlockingSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface BlockingSignal {
  type: BlockingSignalType;
  severity: BlockingSeverity;
  message: string;
}

export function detectBlocking(statusCode: number, html: string): BlockingSignal | null {
  if (statusCode === 403) {
    return { type: 'ip_blocked', severity: 'critical', message: 'HTTP 403 Forbidden — IP may be blocked' };
  }
  if (statusCode === 429) {
    return { type: 'rate_limited', severity: 'high', message: 'HTTP 429 Too Many Requests — rate limited' };
  }
  if (statusCode === 503) {
    return { type: 'service_unavailable', severity: 'medium', message: 'HTTP 503 Service Unavailable' };
  }
  if (html.includes('cf-challenge') || html.includes('captcha-container') || html.includes('g-recaptcha')) {
    return { type: 'captcha', severity: 'critical', message: 'CAPTCHA challenge detected' };
  }
  if (html.includes('Access Denied') || html.includes('access denied')) {
    return { type: 'access_denied', severity: 'critical', message: 'Access Denied page' };
  }
  if (html.length < 500 && !html.includes('screener')) {
    return { type: 'empty_response', severity: 'high', message: `Suspiciously short response (${html.length} bytes)` };
  }
  return null;
}
