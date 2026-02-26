# Task 2: Investment Principles Research — Requirements & Guidance

## Objective

Conduct comprehensive internet research on value investing best practices, stock selection criteria, risk assessment frameworks, and portfolio construction principles from the world's best investors. Produce structured, actionable documentation that Task 3 (Analysis) will use to evaluate every stock.

**This task runs FIRST, before Task 1 and Task 3.** It is executed by a separate Claude Code instance that performs internet research and produces the output documents.

**Re-run cadence:** Monthly or quarterly, to incorporate new insights, updated market conditions, and evolving investment thinking.

---

## Critical Constraints

- This involves **real money decisions**. No shortcuts, no superficial summaries.
- Optimize for **risk-adjusted returns**, NOT maximum returns.
- Every principle must be traceable to a credible source (named investor, published research, or proven track record).
- Include **both what TO do and what NOT to do** (red flags are as important as green flags).
- Indian market-specific nuances must be covered (promoter pledging, related-party transactions, SEBI regulations, etc.).

---

## Research Scope

### Investors to Study

Research the stock selection methodologies of ALL of the following investors. Extract their specific, quantifiable criteria wherever possible.

#### Value Investing School
| Investor | Focus Area | Key Works |
|----------|-----------|-----------|
| **Warren Buffett** | Quality at fair price, economic moats, ROE | Berkshire shareholder letters |
| **Charlie Munger** | Mental models, avoiding stupidity, quality businesses | Poor Charlie's Almanack |
| **Benjamin Graham** | Margin of safety, intrinsic value, quantitative screens | The Intelligent Investor, Security Analysis |
| **Mohnish Pabrai** | Concentrated bets, low risk + high uncertainty | The Dhandho Investor |
| **Seth Klarman** | Margin of safety, catalyst-driven value | Margin of Safety |
| **Joel Greenblatt** | Magic Formula (high ROIC + cheap valuation) | The Little Book That Beats the Market |
| **Peter Lynch** | Growth at reasonable price (GARP), PEG ratio | One Up on Wall Street |
| **Howard Marks** | Risk management, market cycles, second-level thinking | The Most Important Thing |

#### India-Specific Investors
| Investor | Focus Area | Key Works |
|----------|-----------|-----------|
| **Saurabh Mukherjea** | Coffee Can investing, consistent compounders | Coffee Can Investing |
| **Basant Maheshwari** | Growth investing in Indian context | The Thoughtful Investor |
| **Ramdeo Agrawal** | QGLP (Quality, Growth, Longevity, Price) | Wealth Creation Studies (Motilal Oswal) |
| **Vijay Kedia** | SMILE framework (Small cap, Medium term, Intelligent) | Public talks, interviews |
| **Dolly Khanna** | Textile & chemical sector picks, contrarian | Portfolio disclosures |

#### Portfolio Construction & Risk
| Investor | Focus Area | Key Works |
|----------|-----------|-----------|
| **Ray Dalio** | All Weather portfolio, risk parity, long/short spread | Principles, Bridgewater research |
| **George Soros** | Reflexivity, macro trends, catalyst identification | The Alchemy of Finance |
| **Jim Simons / Renaissance** | Quantitative patterns, statistical edges | (Interviews, Man Who Solved the Market) |

### Specific Principles to Extract

For EACH investor, document:

1. **Stock Selection Criteria** — What quantitative thresholds do they use?
2. **Red Flags** — What causes them to immediately reject a stock?
3. **Position Sizing** — How much of portfolio in one stock?
4. **Entry Timing** — When do they buy? (Valuation triggers, market conditions)
5. **Exit Criteria** — When do they sell?
6. **Risk Management** — How do they limit downside?

---

## Quantitative Criteria to Define

Research and recommend specific thresholds for the Indian market context. These will become the scoring rubric for Task 3.

### Valuation Metrics

| Metric | Research Question | Starting Reference |
|--------|------------------|--------------------|
| **P/E Ratio** | What PE range indicates undervaluation in Indian markets by sector? | Buffett: PE x PBV < 22.5 (Graham's number) |
| **P/B Ratio** | Below what PBV is a stock "cheap"? Sector-specific? | Graham: PBV < 1.5 |
| **PEG Ratio** | What PEG indicates growth at a reasonable price? | Lynch: PEG < 1 is ideal |
| **EV/EBITDA** | Sector-specific enterprise value thresholds | Greenblatt: lower is better |
| **Dividend Yield** | Minimum yield for dividend-paying companies | Context-dependent |

### Quality Metrics

| Metric | Research Question | Starting Reference |
|--------|------------------|--------------------|
| **ROE** | What is a good ROE? Consistent ROE over how many years? | Buffett: avg >20% over 10 years, never <15% |
| **ROCE** | Minimum ROCE threshold? | Higher than cost of capital (~12-15% in India) |
| **Debt-to-Equity** | Maximum acceptable leverage? | Buffett: D/E < 0.5 |
| **Current Ratio** | Minimum liquidity? | Buffett: >1.5 |
| **Interest Coverage** | Can the company service its debt? | >3x minimum |
| **Operating Margin** | Minimum margin? Trend direction? | Buffett: gross margin >40% |
| **Free Cash Flow** | Positive FCF for how many consecutive years? | Consistent positive FCF is critical |
| **Profit Growth** | CAGR over what period? Minimum rate? | 15%+ CAGR over 5 years |
| **Revenue Growth** | Minimum top-line growth? | 10%+ CAGR over 5 years |

### Governance & Safety Metrics

| Metric | Research Question | Starting Reference |
|--------|------------------|--------------------|
| **Promoter Holding** | Minimum promoter stake for alignment? | >50% generally preferred in India |
| **Promoter Pledging** | At what pledge % does it become a red flag? | >10% pledged = warning, >25% = danger |
| **FII/DII Holding** | Does institutional interest signal quality? | FII+DII >15% = institutional validation |
| **Related Party Txns** | How to detect excessive related-party transactions? | Compare to revenue, flag if >5% |
| **Auditor Changes** | How many auditor changes in 5 years is a red flag? | >1 change = investigate |
| **Tax Rate** | What effective tax rate suggests manipulation? | Significantly below statutory rate = investigate |

### Volume & Liquidity

| Metric | Research Question | Starting Reference |
|--------|------------------|--------------------|
| **Average Daily Volume** | Minimum volume for investability? | >₹1 crore daily for mid/small cap |
| **Market Cap** | Minimum market cap threshold? | >₹500 crore (avoid extremely illiquid micro-caps) |
| **Free Float** | Minimum free float %? | >25% for adequate liquidity |

---

## Long/Short Spread Analysis

Following Dalio's principles, the system should identify BOTH:

### Long Candidates (Expected to Outperform)
- Strong fundamentals + undervaluation (value trap screening critical)
- Positive momentum in fundamentals (improving ROE, reducing debt)
- Positive catalysts upcoming (sector tailwinds, capex cycle, market share gains)
- Low risk of permanent capital loss

### Short/Avoid Candidates (Expected to Underperform)
- Deteriorating fundamentals despite high valuation
- Increasing leverage + declining profitability
- Governance red flags (pledging, related party, auditor issues)
- Negative catalysts (regulatory risk, sector headwinds, demand collapse)
- Low quality dressed up as growth (aggressive accounting, one-time gains)

### Spread Maximization Research
- Study Dalio's risk parity principles for the stock selection context
- Research pair trading strategies (long sector winner, short sector loser)
- Study how Bridgewater identifies relative value within sectors
- Document how to construct a hedged portfolio from the ranked lists

---

## Indian Market-Specific Research

### Unique Factors
- **Promoter-driven economy**: Most Indian companies are promoter-led. Assess promoter quality differently than Western manager-led companies.
- **Related party transactions**: Common in Indian business groups. Learn to distinguish benign vs predatory.
- **SEBI surveillance**: Companies under ASM/GSM frameworks — what does this mean for investment?
- **Pledging culture**: Promoter share pledging is common in India. Research historic cases of pledge-related crashes (e.g., Zee, Yes Bank, Essel Group).
- **Seasonal patterns**: Budget, monsoon, festive season impact on different sectors.
- **FII flows**: Foreign Institutional Investor flows significantly impact Indian markets.
- **Taxation**: Capital gains tax (LTCG/STCG) impact on holding period decisions.

### Red Flags Specific to Indian Markets
1. Promoter pledging > 25%
2. Frequent equity dilution (preferential allotments to promoter entities)
3. Unusual related-party loan patterns
4. Company in SEBI's Additional Surveillance Measure (ASM) or Graded Surveillance Measure (GSM)
5. Qualified opinion in auditor's report
6. Sudden management changes without explanation
7. Cash-rich company with low dividend payout + no capex (cash siphoning risk)
8. Exceptionally high other income relative to operating income
9. Divergence between reported profits and operating cash flow
10. Geographic concentration risk (single factory, single region)

---

## Output Documents

### 1. `principles/investment-principles.md`

A comprehensive, well-organized markdown document containing:
- Executive summary of the investment philosophy
- Per-investor principle summaries
- Synthesized "master checklist" combining the best of all investors
- India-specific adjustments to global principles

### 2. `principles/scoring-rubric.json`

Machine-readable scoring criteria for Task 3:

```json
{
  "version": "1.0",
  "last_updated": "2026-02-XX",
  "scoring_dimensions": {
    "valuation": {
      "weight": 0.25,
      "metrics": {
        "pe_ratio": {
          "ideal_range": [0, 15],
          "acceptable_range": [15, 25],
          "red_flag_above": 50,
          "sector_adjustments": {
            "IT": { "ideal_range": [0, 25], "acceptable_range": [25, 35] },
            "Banking": { "ideal_range": [0, 12], "acceptable_range": [12, 20] }
          }
        },
        "peg_ratio": { "ideal_below": 1.0, "acceptable_below": 1.5 },
        "pb_ratio": { "ideal_below": 2.0, "acceptable_below": 3.0 },
        "ev_ebitda": { "ideal_below": 10, "acceptable_below": 15 }
      }
    },
    "quality": {
      "weight": 0.30,
      "metrics": {
        "roe_avg_5y": { "minimum": 15, "excellent": 20 },
        "roce_avg_5y": { "minimum": 15, "excellent": 20 },
        "debt_to_equity": { "maximum": 1.0, "ideal_below": 0.5 },
        "current_ratio": { "minimum": 1.5 },
        "interest_coverage": { "minimum": 3 },
        "fcf_positive_years_of_5": { "minimum": 4 },
        "profit_cagr_5y": { "minimum": 10, "excellent": 15 },
        "revenue_cagr_5y": { "minimum": 10, "excellent": 15 }
      }
    },
    "governance": {
      "weight": 0.20,
      "metrics": {
        "promoter_holding_pct": { "minimum": 40, "ideal_above": 50 },
        "promoter_pledge_pct": { "warning_above": 10, "red_flag_above": 25 },
        "institutional_holding_pct": { "good_above": 15 },
        "auditor_changes_5y": { "red_flag_above": 1 }
      }
    },
    "safety": {
      "weight": 0.15,
      "metrics": {
        "market_cap_cr": { "minimum": 500 },
        "avg_daily_volume_cr": { "minimum": 1 },
        "free_float_pct": { "minimum": 25 }
      }
    },
    "momentum": {
      "weight": 0.10,
      "metrics": {
        "roe_trend": "improving",
        "debt_trend": "decreasing",
        "margin_trend": "stable_or_improving",
        "promoter_holding_trend": "stable_or_increasing"
      }
    }
  },
  "automatic_disqualifiers": [
    "promoter_pledge_pct > 50",
    "negative_net_worth",
    "asm_gsm_listed",
    "qualified_audit_opinion",
    "operating_cash_flow_negative_3_consecutive_years",
    "debt_to_equity > 3"
  ]
}
```

### 3. `principles/red-flags.md`

Detailed document on what to AVOID, with:
- Per-red-flag explanation
- Historical examples (Indian market cases)
- Severity levels (warning vs dealbreaker)
- How to detect each red flag from screener data

### 4. `principles/investor-profiles.md`

Per-investor deep dive:
- Philosophy summary (2-3 paragraphs)
- Key quantitative criteria (table format)
- Famous picks and what they teach
- Applicability to Indian market context

### 5. `principles/long-short-framework.md`

Specific to long/short identification:
- How to identify long candidates
- How to identify short/avoid candidates
- Pair construction within sectors
- Risk parity principles applied to stock selection
- Spread maximization strategies

---

## Research Methodology for Claude Code Instance

The Claude Code instance performing this task should:

1. **Search broadly** — use multiple queries per topic, cross-reference sources
2. **Prioritize primary sources** — shareholder letters, published books, academic papers over blog posts
3. **Be skeptical** — if a "principle" is only mentioned on one blog, it's not established
4. **Quantify everything** — "low PE" is useless; "PE < 15 for manufacturing sector" is useful
5. **India-specific validation** — every global principle should be tested against Indian market reality (e.g., Buffett's D/E < 0.5 may be too strict for Indian banks)
6. **Document disagreements** — where investors disagree, document both perspectives and recommend a balanced approach
7. **Version the output** — include version number and date, so future updates can be tracked

---

## Acceptance Criteria

- [ ] At least 10 investors' methodologies documented with specific, quantifiable criteria
- [ ] Scoring rubric JSON is complete and parseable by Task 3's code
- [ ] At least 20 specific red flags documented with detection methods
- [ ] India-specific factors covered (promoter analysis, SEBI regulations, FII impact)
- [ ] Long/short framework documented with concrete criteria
- [ ] All principles traceable to named, credible sources
- [ ] Sector-specific adjustments provided for at least 5 major sectors (IT, Banking/Finance, Pharma, Manufacturing, FMCG)
