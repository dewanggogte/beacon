/**
 * Builds agent-specific data payloads from Layer 1 output.
 * Each agent gets ONLY what it needs + methodology context.
 */
import type { CompanyAnalysis, FrameworkResults } from '@screener/shared';
import type { EnrichedSnapshot } from '../../enrichment/flatten-v2.js';

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined) return 'N/A';
  return v.toFixed(decimals);
}

function fmtSeries(values: (number | null)[], maxLen = 10, decimals = 0): string {
  const slice = values.slice(0, maxLen);
  return slice.map((v) => v !== null ? v.toFixed(decimals) : 'N/A').join(', ');
}

function formatPeerComparison(peers: Record<string, unknown>[] | null): string {
  if (!peers || peers.length === 0) return '';
  const top5 = peers.slice(0, 5);
  const header = 'Name | CMP | P/E | Mar Cap (Cr) | ROCE% | Div Yld%';
  const sep = '---|---|---|---|---|---';
  const rows = top5.map((p) => {
    const name = String(p['Name'] ?? p['name'] ?? 'N/A');
    const cmp = String(p['CMP'] ?? p['cmp'] ?? 'N/A');
    const pe = String(p['P/E'] ?? p['pe'] ?? 'N/A');
    const mcap = String(p['Mar Cap'] ?? p['marCap'] ?? p['Mar Cap.'] ?? 'N/A');
    const roce = String(p['ROCE'] ?? p['roce'] ?? 'N/A');
    const divYld = String(p['Div Yld'] ?? p['divYld'] ?? p['Div Yld.'] ?? 'N/A');
    return `${name} | ${cmp} | ${pe} | ${mcap} | ${roce} | ${divYld}`;
  });
  return `\n<peer_comparison>
Top peers in sector:
${header}
${sep}
${rows.join('\n')}
</peer_comparison>`;
}

function fmtCriteria(criteria: { name: string; passed: boolean; value: number | null; threshold: string; detail?: string }[]): string {
  return criteria.map((c) => {
    const status = c.passed ? 'PASS' : 'FAIL';
    const val = c.value !== null ? c.value : 'N/A';
    return `  ${status}: ${c.name} = ${val} (threshold: ${c.threshold})${c.detail ? ` — ${c.detail}` : ''}`;
  }).join('\n');
}

export function buildFundamentalsDataPack(
  analysis: CompanyAnalysis,
  enriched: EnrichedSnapshot,
  fr: FrameworkResults,
): string {
  return `<company_data>
Company: ${analysis.companyName} (${analysis.screenerCode})
Sector: ${enriched.sector}
Lynch Category: ${fr.lynch.category}

Composite Score: ${analysis.compositeScore}/100
Classification: ${analysis.classification}
${analysis.disqualified ? `DISQUALIFIED: ${analysis.disqualificationReasons.join(', ')}` : ''}

<framework_scores>
Buffett: ${fr.buffett.score}/100 (${fr.buffett.passCount}/${fr.buffett.totalCriteria} criteria)
${fmtCriteria(fr.buffett.criteria)}
Moat Indicators: ${fr.buffett.moatIndicators.length > 0 ? fr.buffett.moatIndicators.join('; ') : 'None'}

Graham: ${fr.graham.score}/100 (${fr.graham.passCount}/${fr.graham.totalCriteria} criteria)
${fmtCriteria(fr.graham.criteria)}
Graham Number: ${fmt(fr.graham.grahamNumber)} | NCAV: ${fmt(fr.graham.ncav, 0)} | Margin of Safety: ${fmt(fr.graham.marginOfSafety)}%

Lynch (${fr.lynch.category}): ${fr.lynch.categoryScore}/100
Category rationale: ${fr.lynch.classificationRationale}
${fmtCriteria(fr.lynch.categoryMetrics)}

Pabrai Risk: ${fr.pabrai.riskScore}/100 (${fr.pabrai.overallRisk})
${fmtCriteria(fr.pabrai.factors)}
</framework_scores>

<time_series>
ROE (derived, annual): ${fmtSeries(enriched.roeHistory)}
ROCE (from ratios): ${fmtSeries(enriched.roceHistory)}
OPM% (annual): ${fmtSeries(enriched.opmHistory)}
Net Margin% (annual): ${fmtSeries(enriched.netMarginHistory, 10, 1)}
Revenue (Cr): ${fmtSeries(enriched.revenueHistory)}
Net Profit (Cr): ${fmtSeries(enriched.netProfitHistory)}
EPS: ${fmtSeries(enriched.epsHistory, 10, 1)}
D/E (annual): ${fmtSeries(enriched.deHistory, 10, 2)}
OCF (Cr): ${fmtSeries(enriched.ocfHistory)}
Owner Earnings (Cr): ${fmtSeries(enriched.ownerEarningsHistory)}
</time_series>

<current_metrics>
Market Cap: ${fmt(enriched.marketCap, 0)} Cr | P/E: ${fmt(enriched.stockPe)} | P/B: ${fmt(enriched.pbRatio, 2)} | Div Yield: ${fmt(enriched.dividendYield)}%
ROCE: ${fmt(enriched.roce)}% | ROE: ${fmt(enriched.roe)}% | D/E: ${fmt(enriched.debtToEquity, 2)}
52W High/Low: ${fmt(enriched.high52w, 0)}/${fmt(enriched.low52w, 0)} | Current: ${fmt(enriched.currentPrice, 0)}
Revenue CAGR 5Y: ${enriched.revenueCagr5Y !== null ? (enriched.revenueCagr5Y * 100).toFixed(1) : 'N/A'}% | Profit CAGR 5Y: ${enriched.profitCagr5Y !== null ? (enriched.profitCagr5Y * 100).toFixed(1) : 'N/A'}%
</current_metrics>

<screener_signals>
Pros: ${enriched.pros.length > 0 ? enriched.pros.map((p) => `\n- ${p}`).join('') : 'None'}
Cons: ${enriched.cons.length > 0 ? enriched.cons.map((c) => `\n- ${c}`).join('') : 'None'}
</screener_signals>
${formatPeerComparison(enriched.peerComparison)}
</company_data>`;
}

export function buildGovernanceDataPack(
  analysis: CompanyAnalysis,
  enriched: EnrichedSnapshot,
  fr: FrameworkResults,
): string {
  return `<company_data>
Company: ${analysis.companyName} (${analysis.screenerCode})
Sector: ${enriched.sector}

<shareholding_history>
Promoter (%): ${fmtSeries(enriched.promoterHoldingHistory, 12, 2)}
FII (%): ${fmtSeries(enriched.fiiHistory, 12, 2)}
DII (%): ${fmtSeries(enriched.diiHistory, 12, 2)}
Public (%): ${fmtSeries(enriched.publicHoldingHistory, 12, 2)}
Shareholders (#): ${fmtSeries(enriched.shareholderCountHistory, 12, 0)}
</shareholding_history>

<current_shareholding>
Promoter: ${fmt(enriched.promoterHolding, 2)}% | Pledge: ${fmt(enriched.promoterPledge, 2)}%
FII: ${fmt(enriched.fiiHolding, 2)}% | DII: ${fmt(enriched.diiHolding, 2)}%
Promoter 4Q Change: ${enriched.promoterHolding4qChange !== null ? (enriched.promoterHolding4qChange > 0 ? '+' : '') + enriched.promoterHolding4qChange.toFixed(2) : 'N/A'}pp
Shareholder Count Trend: ${enriched.shareholderCountTrend !== null ? (enriched.shareholderCountTrend > 0 ? '+' : '') + enriched.shareholderCountTrend.toFixed(1) : 'N/A'}%
</current_shareholding>

<governance_scores>
Governance Dimension: ${analysis.dimensionScores.find((d) => d.dimension === 'governance')?.score ?? 'N/A'}/100
Pabrai Promoter Pledge Factor: ${fmtCriteria([fr.pabrai.factors.find((f) => f.name === 'Promoter Pledge')!].filter(Boolean))}
</governance_scores>

<screener_signals>
Pros: ${enriched.pros.length > 0 ? enriched.pros.map((p) => `\n- ${p}`).join('') : 'None'}
Cons: ${enriched.cons.length > 0 ? enriched.cons.map((c) => `\n- ${c}`).join('') : 'None'}
</screener_signals>
</company_data>`;
}

export function buildRiskDataPack(
  analysis: CompanyAnalysis,
  enriched: EnrichedSnapshot,
  fr: FrameworkResults,
): string {
  return `<company_data>
Company: ${analysis.companyName} (${analysis.screenerCode})
Sector: ${enriched.sector}
Lynch Category: ${fr.lynch.category}
${analysis.disqualified ? `DISQUALIFIED: ${analysis.disqualificationReasons.join(', ')}` : ''}

<pabrai_risk_screen>
Overall Risk: ${fr.pabrai.overallRisk} (${fr.pabrai.riskScore}/100)
${fmtCriteria(fr.pabrai.factors)}
</pabrai_risk_screen>

<leverage_history>
D/E (annual): ${fmtSeries(enriched.deHistory, 10, 2)}
Interest Coverage: ${fmt(enriched.interestCoverage)}x
Interest/Revenue: ${fmt(enriched.interestToRevenue)}%
Borrowings (Cr): ${fmtSeries(enriched.borrowingsHistory, 5, 0)}
OCF (Cr): ${fmtSeries(enriched.ocfHistory, 5, 0)}
</leverage_history>

<earnings_stability>
Net Profit (Cr): ${fmtSeries(enriched.netProfitHistory, 10, 0)}
Earnings CV: ${fmt(enriched.earningsVarianceCv, 2)}
Revenue CV: ${enriched.revenueHistory.length > 0 ? 'computed' : 'N/A'}
</earnings_stability>

<screener_signals>
Pros: ${enriched.pros.length > 0 ? enriched.pros.map((p) => `\n- ${p}`).join('') : 'None'}
Cons: ${enriched.cons.length > 0 ? enriched.cons.map((c) => `\n- ${c}`).join('') : 'None'}
</screener_signals>
</company_data>`;
}

export function buildSynthesisDataPack(
  analysis: CompanyAnalysis,
  enriched: EnrichedSnapshot,
  fr: FrameworkResults,
  fundamentalsOutput: string,
  governanceOutput: string,
  riskOutput: string,
  regimeContext?: { regime: string; confidence: string; signals: string[] } | null,
): string {
  const macroSection = regimeContext
    ? `\n<macro_environment>
Current Regime: ${regimeContext.regime} (${regimeContext.confidence} confidence)
Signals: ${regimeContext.signals.join('; ')}
</macro_environment>`
    : '';

  return `<company_data>
Company: ${analysis.companyName} (${analysis.screenerCode})
Sector: ${enriched.sector}
Lynch Category: ${fr.lynch.category}
Classification Rationale: ${fr.lynch.classificationRationale}

Composite Score: ${analysis.compositeScore}/100
Classification: ${analysis.classification}
${analysis.disqualified ? `DISQUALIFIED: ${analysis.disqualificationReasons.join(', ')}` : ''}

<framework_scores>
Buffett: ${fr.buffett.score}/100 (${fr.buffett.passCount}/${fr.buffett.totalCriteria})
Graham: ${fr.graham.score}/100 (${fr.graham.passCount}/${fr.graham.totalCriteria})
Lynch (${fr.lynch.category}): ${fr.lynch.categoryScore}/100
Pabrai Risk: ${fr.pabrai.riskScore}/100 (${fr.pabrai.overallRisk})
</framework_scores>

<current_metrics>
Market Cap: ${fmt(enriched.marketCap, 0)} Cr | P/E: ${fmt(enriched.stockPe)} | P/B: ${fmt(enriched.pbRatio, 2)}
ROCE: ${fmt(enriched.roce)}% | ROE: ${fmt(enriched.roe)}%
</current_metrics>
${formatPeerComparison(enriched.peerComparison)}${macroSection}
</company_data>

<analyst_reports>
<fundamentals_analyst>
${fundamentalsOutput}
</fundamentals_analyst>

<governance_analyst>
${governanceOutput}
</governance_analyst>

<risk_analyst>
${riskOutput}
</risk_analyst>
</analyst_reports>`;
}
