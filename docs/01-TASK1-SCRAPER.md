# Task 1: Screener.in Data Scraper — Requirements & Guidance

## Objective

Build a Puppeteer-based browser automation system that scrapes ALL companies listed on Screener.in (~5,000-6,000 companies), extracts comprehensive financial data for each, and stores it in a structured PostgreSQL database. The system must operate undetected by anti-bot systems and run weekly on a schedule.

---

## Critical Context

**Screener.in does NOT have a free public API.** There is a third-party Apify actor, but it is paid and limited. The only viable free approach is browser-based scraping.

Screener.in likely uses some form of bot protection (possibly Cloudflare or a custom solution). The scraper must be built defensively from day one.

---

## Technology Requirements

### Core Stack

```
Node.js (v20+)
├── puppeteer-extra              # Enhanced Puppeteer with plugin support
├── puppeteer-extra-plugin-stealth  # Patches automation fingerprints
├── pg (node-postgres)           # PostgreSQL client
└── TypeScript                   # Type safety for complex data structures
```

### Why Puppeteer (Not Playwright)

- More mature stealth plugin ecosystem
- `puppeteer-extra-plugin-stealth` is battle-tested against Cloudflare
- Better community resources for anti-detection patterns
- Chrome DevTools Protocol gives deeper control

---

## Anti-Detection System

This is the most critical component. The scraper MUST behave indistinguishably from a human user.

### 1. Browser Fingerprint Management

```typescript
// Required stealth configuration
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch({
  headless: false,            // Use headful mode — headless is more detectable
  userDataDir: './chrome-profile',  // Persist cookies, localStorage across sessions
  args: [
    '--disable-blink-features=AutomationControlled',
    '--exclude-switches=enable-automation',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=IsolateOrigins,site-per-process',
    // Use a real window size
    '--window-size=1920,1080',
  ],
});
```

### 2. Human-Like Interaction Functions

**These are MANDATORY for all interactions with the page. Never use raw Puppeteer click/type.**

```typescript
// human_click(page, selector, options?)
// - Move mouse to element with bezier curve path (not linear)
// - Random offset within element bounds (don't always click center)
// - Random delay before click (200-800ms)
// - Occasionally overshoot and correct (5-10% of the time)
// - Mouse movement speed: variable, 50-200ms per movement segment

// human_type(page, selector, text, options?)
// - Click into field first using human_click
// - Type each character with random delay (50-200ms per character)
// - Occasionally pause mid-word (simulating thought, 500-1500ms, ~10% probability)
// - Occasionally make a typo and backspace correct it (~5% probability)
// - Variable overall speed per session (some sessions type faster)

// human_scroll(page, direction, amount, options?)
// - Smooth scroll with variable speed
// - Occasional pause mid-scroll
// - Sometimes scroll past target and scroll back slightly
// - Random scroll amounts (not exact pixel values)

// human_wait(minMs, maxMs)
// - Random delay between min and max
// - Follows approximate normal distribution (not uniform)
// - Longer pauses occasionally simulate reading (2-8 seconds)
```

### 3. Behavioral Patterns

```
Per-page behavior:
1. Navigate to page
2. Wait for load (human_wait 1000-3000ms)
3. Scroll down slowly (human_scroll) — read the page like a human
4. Sometimes hover over random elements
5. Extract data
6. human_wait before next navigation (2000-8000ms)

Per-session behavior:
- Vary session duration (30 min to 2 hours)
- Take breaks between batches (5-15 min every 50-100 pages)
- Don't scrape at the same time every day when running ad-hoc
- Weekly cron should have randomized start time (±30 min jitter)

Cross-session behavior:
- Maintain cookies and session state between runs
- Don't clear browser profile between scrapes
- Occasionally visit screener.in homepage, login page, and other non-data pages
- Build up a browsing history that looks natural
```

### 4. Bot Detection Techniques to Counter

Based on research into Cloudflare and similar systems:

| Detection Method | Our Counter |
|-----------------|-------------|
| **navigator.webdriver** | Stealth plugin patches this to `false` |
| **HeadlessChrome user-agent** | Stealth plugin replaces with real Chrome UA |
| **TLS fingerprint (JA3/JA4)** | Using real Chrome (headful), not headless Chromium |
| **HTTP/2 fingerprint** | Real Chrome browser handles this natively |
| **Canvas fingerprint** | Using real Chrome with GPU = real canvas fingerprint |
| **WebGL fingerprint** | Real Chrome in headful mode = legitimate WebGL |
| **IP reputation** | Residential IP (home server). If blocked, consider residential proxy rotation |
| **Behavioral analysis** | Human-like functions (above) + session patterns |
| **JavaScript challenges** | Real Chrome executes these natively |
| **Rate limiting** | Conservative pacing (2-8 second delays) |
| **Request pattern analysis** | Randomized navigation order, not sequential |

### 5. IP Rotation Strategy

**Start without IP rotation.** Home residential IP should have good reputation. Only implement rotation if initial approach gets blocked.

If rotation needed:
- Use a residential proxy service (not datacenter proxies)
- Rotate per session, not per request (consistent IP within a session looks more human)
- Good options: Bright Data residential, Oxylabs residential, SmartProxy
- Budget estimate: $10-15/month for 1GB (sufficient for weekly scrapes)

### 6. Screener.in Login

Screener.in has some features behind login (e.g., watchlists, export). Determine if login provides access to additional data points. If so:
- Create a legitimate account
- Login at session start using human_type for credentials
- Maintain session cookies
- **Never store credentials in code** — use environment variables

---

## Data to Scrape

### Company List Page

URL pattern: `https://www.screener.in/screens/357649/all-listed-companies/` or use the screen query system.

Extract: Company name, BSE/NSE code, link to detail page.

**Pagination**: Screener.in paginates results. Navigate through all pages to get complete list.

### Per-Company Detail Page

URL pattern: `https://www.screener.in/company/{COMPANY_CODE}/`

**Scrape ALL available sections:**

#### Summary/Header Section
- Company name
- BSE code, NSE code
- Current market price
- Market capitalization
- Sector / Industry
- Website URL

#### Key Ratios (Top Section)
- Market Cap
- Current Price
- High / Low (52-week)
- Stock P/E
- Book Value
- Dividend Yield
- ROCE (Return on Capital Employed)
- ROE (Return on Equity)
- Face Value
- Pros and Cons (machine-generated text)

#### Quarterly Results Table
- Quarter-wise revenue, expenses, operating profit, OPM%, net profit, EPS
- Last 8-12 quarters

#### Profit & Loss Statement
- Annual revenue, expenses, operating profit, OPM%, net profit, EPS
- Last 10-12 years

#### Balance Sheet
- Assets, liabilities, equity
- Borrowings, reserves
- Last 10-12 years

#### Cash Flow Statement
- Cash from operations, investing, financing
- Net cash flow
- Last 10-12 years

#### Ratios
- ROCE, ROE, debt-to-equity, current ratio, etc.
- Last 10-12 years

#### Shareholding Pattern
- Promoter holding %, pledge %
- FII/FPI holding %
- DII holding %
- Public holding %
- Quarter-wise changes

#### Peer Comparison
- Sector peers with key metrics

---

## Database Schema

### Design Principles
- Every scrape creates a timestamped snapshot (enables week-over-week comparison)
- Normalize where appropriate, but optimize for read-heavy analytical queries
- Use JSONB for flexible/variable-length data (like quarterly tables with varying columns)

### Core Tables

```sql
-- Company master
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    screener_code VARCHAR(50) UNIQUE NOT NULL,  -- URL slug
    name VARCHAR(255) NOT NULL,
    bse_code VARCHAR(20),
    nse_code VARCHAR(20),
    sector VARCHAR(100),
    industry VARCHAR(100),
    website VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scrape run metadata
CREATE TABLE scrape_runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    total_companies INT,
    successful INT DEFAULT 0,
    failed INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running'  -- running, completed, failed
);

-- Company snapshot (one per company per scrape run)
CREATE TABLE company_snapshots (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(id),
    scrape_run_id INT REFERENCES scrape_runs(id),
    scraped_at TIMESTAMPTZ DEFAULT NOW(),

    -- Key metrics (flattened for easy querying)
    market_cap NUMERIC,
    current_price NUMERIC,
    high_52w NUMERIC,
    low_52w NUMERIC,
    stock_pe NUMERIC,
    book_value NUMERIC,
    dividend_yield NUMERIC,
    roce NUMERIC,
    roe NUMERIC,
    face_value NUMERIC,

    -- Structured data as JSONB
    pros JSONB,                    -- Array of pro strings
    cons JSONB,                    -- Array of con strings
    quarterly_results JSONB,       -- Array of quarterly data objects
    annual_pl JSONB,               -- Annual P&L data
    balance_sheet JSONB,           -- Annual balance sheet data
    cash_flow JSONB,               -- Annual cash flow data
    ratios JSONB,                  -- Historical ratios
    shareholding JSONB,            -- Shareholding pattern over quarters
    peer_comparison JSONB,         -- Peer company data

    UNIQUE(company_id, scrape_run_id)
);

-- Indexes for common queries
CREATE INDEX idx_snapshots_company ON company_snapshots(company_id);
CREATE INDEX idx_snapshots_run ON company_snapshots(scrape_run_id);
CREATE INDEX idx_snapshots_pe ON company_snapshots(stock_pe) WHERE stock_pe IS NOT NULL;
CREATE INDEX idx_snapshots_roe ON company_snapshots(roe) WHERE roe IS NOT NULL;
CREATE INDEX idx_snapshots_roce ON company_snapshots(roce) WHERE roce IS NOT NULL;
CREATE INDEX idx_snapshots_market_cap ON company_snapshots(market_cap) WHERE market_cap IS NOT NULL;
```

---

## Scraping Strategy

### Ordering: Randomize, Don't Go Sequentially

```
❌ BAD:  Company A → Company B → Company C → ... (alphabetical)
✅ GOOD: Company M → Company A → Company Z → Company D → ... (randomized)
```

Sequential scraping is a strong bot signal. Shuffle the company list at the start of each run.

### Batch Processing

```
Total companies: ~5,500
Average time per company: ~10 seconds (page load + extraction + human delays)
Average delay between companies: ~5 seconds

Estimated time per batch of 100: ~25 minutes
Break between batches: 5-15 minutes
Batches per session: ~4-6

Total estimated time for full scrape: ~6-8 hours
```

This fits within the Saturday night → Sunday morning window.

### Error Handling & Resumability

- Track which companies have been scraped in current run
- On failure (timeout, blocked, error), log the failure and continue
- Support resume from last successful point
- If a CAPTCHA is detected: stop the current session, wait 30-60 minutes, resume with new session
- If IP is blocked: notify via log/alert, switch to backup strategy

### Data Validation

After scraping each page:
- Verify key fields are not null (market cap, price, PE should exist for active companies)
- Verify numerical fields are reasonable (no negative market caps, PE < 10000, etc.)
- Log warnings for suspicious data but still store it (flag for review)
- Count successful vs failed extractions per run

---

## Monitoring & Alerting

- Log every page visit with timestamp, response code, extraction success
- Track success rate per run (alert if < 90%)
- Track average response time (alert if significantly slower, may indicate throttling)
- Track CAPTCHA encounters (alert on first occurrence)
- Weekly summary: companies scraped, failures, new companies detected, delisted companies

---

## Configuration

All tunable parameters should be in a config file, not hardcoded:

```typescript
// config.ts
export const CONFIG = {
  // Timing
  minDelayBetweenPages: 2000,     // ms
  maxDelayBetweenPages: 8000,     // ms
  minDelayBetweenBatches: 300000, // 5 min
  maxDelayBetweenBatches: 900000, // 15 min
  batchSize: 100,
  
  // Session
  maxPagesPerSession: 500,
  sessionBreakMin: 600000,        // 10 min
  sessionBreakMax: 1800000,       // 30 min
  
  // Retry
  maxRetriesPerPage: 3,
  retryDelay: 30000,              // 30 seconds
  captchaBackoff: 3600000,        // 1 hour
  
  // Database
  dbConnectionString: process.env.DATABASE_URL,
  
  // Browser
  headless: false,
  userDataDir: './chrome-profile',
  
  // Proxy (disabled by default)
  useProxy: false,
  proxyUrl: process.env.PROXY_URL,
};
```

---

## Testing Plan

1. **Unit test** the data extraction functions with saved HTML snapshots
2. **Integration test** with 5-10 companies to verify full pipeline
3. **Stealth test**: Visit `https://bot.sannysoft.com/` and `https://fingerprint.com/demo/` to verify browser fingerprint looks human
4. **Load test**: Run against 100 companies and verify no blocking
5. **Resume test**: Kill the process mid-run and verify it resumes correctly
6. **Data integrity test**: Compare scraped data against manually verified data for 5 companies

---

## Deliverables

1. `packages/scraper/` — Complete scraper codebase
2. `scripts/setup-db.sql` — Database schema
3. `docs/anti-detection-playbook.md` — Detailed anti-detection strategies
4. `docs/data-dictionary.md` — Every field, its type, source, and meaning
5. `docker/Dockerfile.scraper` — Containerized scraper
6. `k8s/scraper-cronjob.yaml` — Kubernetes CronJob for weekly execution
