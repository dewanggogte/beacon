# Beacon

I've been interested in value investing for a while. Not day trading, not crypto, not "tips from my CA uncle." The Buffett-Graham school. Buy good companies at reasonable prices, hold them, don't check your phone every 4 minutes.

The problem is India has over 5,300 listed companies. Screener.in is great for looking up a company you already know about. But evaluating all of them? Open a page, check the ratios, read the quarterly numbers, form an opinion, move to the next one. Do this 5,300 times. Nobody's doing that.

So I built a pipeline that does.

## How it works

Four stages: scrape, score, analyze, present.

**Scrape**
Every listed Indian company gets pulled from Screener.in. Quarterly results, annual P&L, balance sheets, cash flows, shareholding patterns, key ratios, pros and cons. About 13 years of data per company, stored in Postgres. The full scrape takes about 18 hours (I keep the request rate polite).

**Score**
21 quantitative metrics across five dimensions: quality (30%), valuation (25%), governance (20%), safety (15%), momentum (10%). The weights are sector-adjusted because you can't evaluate a bank the same way you evaluate an IT company. Debt-to-equity means something very different for HDFC Bank vs TCS.

Four value investing frameworks run on top of this. Buffett's quality checklist, Graham's value screen, Lynch's growth categorization, Pabrai's risk assessment. These get blended into a composite. Companies failing any of 8 hard disqualification rules get flagged regardless of score. Things like net losses in 3 of the last 5 years, or promoter stake declining more than 10 percentage points in a year.

**Analyze**
The top ~600 companies by quant score enter a multi-agent LLM pipeline. Four agents, each reading the full data for a company independently.

AG1 does fundamentals. Earnings quality, growth, balance sheet. AG2 does governance. Promoter behaviour, related-party transactions, capital allocation. Indian markets have enough governance disasters that this needs its own agent. AG3 is the devil's advocate. Must find at least 2 risks per company, no matter how good it looks.

AG4 reads the other three and produces a final classification and investment thesis. It can override the quantitative score entirely. If the numbers say "strong long" but AG4 sees something off, it can downgrade. Or the other way.

Not everyone gets the full treatment. ~600 get an AG1 screen, only the best ~200 get all four agents. Keeps the API bill sane.

**Present**
Results show up in a dashboard. Eight pages: home with high conviction picks, pipeline overview, rankings, conviction lists, framework comparisons, company deep-dives with agent reasoning, backtesting, pipeline status.

## Numbers alone are not enough

Two companies can have identical scores but very different stories. One might be a well-run mid-cap that's genuinely undervalued. The other might have great numbers because it's cooking the books (hello, certain infrastructure companies).

AG3 has flagged companies that looked perfect on paper but had concerning related-party transaction patterns. You'd catch that reading the annual report. You wouldn't catch it with a formula.

There's a divergence watcher that runs after the pipeline finishes. When AG4 and the quant score disagree by more than 25 points or 2 classification levels, it emails me. I look at those manually. They're usually the ones worth looking at.

## Tech stack

**Scraper**
HTTP + Cheerio. No headless browser. Screener.in doesn't need one.

**Database**
PostgreSQL 17, Drizzle ORM. Flat columns for queries, JSONB for time-series.

**LLM**
Anthropic Claude (Haiku for screening, Sonnet for synthesis) with prompt caching. Or local Qwen 3.5 via SGLang when I don't want to spend on API calls. An env var switches between them.

**Dashboard**
Next.js 15, Tailwind CSS 4, Source Serif 4 font, terracotta accent color. It had a dark Bloomberg terminal look for a while but I got tired of green-on-black.

**Infra**
Docker, K3s homelab, GitHub Actions, ArgoCD. Internal only at beacon.nikamma.in.

## Running it

Weekly CronJob. Saturday night scrape, scoring and LLM analysis through the night, dashboard updated by Sunday.

```
npm run pipeline          # full run
npm run pipeline:quick    # quant only, no LLM
npm run dashboard         # next.js on :3000
```

Or for specific companies:

```
npx tsx packages/analyzer/src/index.ts analyze --companies=RELIANCE,TCS
npx tsx packages/analyzer/src/index.ts analyze --sectors=Banking --limit=20
```

## Backtesting

There's a backtesting system that pulls historical prices from Yahoo Finance and checks how past picks would have done. Walk-forward analysis across multiple periods. I won't claim the results are statistically significant. But they catch obvious calibration problems in the scoring weights.

## Bugs I remember

Screener.in formats numbers the Indian way (19,10,048 instead of 1,910,048). Parser needed to handle that. Some company pages just don't have certain financial tables. The scraper kept crashing until I added null handling for every single field.

The LLM agents used to produce "adjustments" to the quant score. Plus 5, minus 3, that kind of thing. Problem was they'd anchor on the quant number and just nudge it. I changed them to produce independent scores (0-100) instead. AG4 actually disagrees with the quant score now, which is the whole point.

Haiku kept truncating its output at 1024 tokens. Took me longer than I'd like to admit to realize that was a maxTokens setting, not a model limitation.

---

Code is at [github.com/dewanggogte/beacon](https://github.com/dewanggogte/beacon). Personal tool. I built it because I wanted it.

Ciao.
