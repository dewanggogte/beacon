import { getCompanyPageData } from '@/lib/queries';
import { StatCard } from '@/components/stat-card';
import { MetricStrip } from '@/components/metric-strip';
import { FrameworkScores } from '@/components/framework-scores';
import { AgentAnalysisPanel } from '@/components/agent-analysis-panel';
import { LynchBadge } from '@/components/lynch-badge';
import { ConvictionBadge } from '@/components/conviction-badge';
import { WatchlistButton } from '@/components/watchlist-button';
import { ProgressiveSections } from '@/components/progressive-sections';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return 'text-accent-green dark:text-accent-green';
  if (score >= 65) return 'text-accent-cyan dark:text-accent-cyan';
  if (score >= 40) return 'text-text-secondary dark:text-dark-text-secondary';
  return 'text-accent-red dark:text-accent-red';
}

function classificationColor(cls: string): string {
  switch (cls) {
    case 'strong_long': return 'text-accent-green';
    case 'potential_long': return 'text-accent-cyan';
    case 'neutral': return 'text-text-secondary';
    case 'potential_short': return 'text-accent-amber';
    case 'strong_avoid': return 'text-accent-red';
    default: return 'text-text-muted';
  }
}

function fmt(val: number | null | undefined, decimals = 1): string {
  if (val == null) return '-';
  return Number(val).toFixed(decimals);
}

// ── Types for LLM JSONB fields ────────────────────────────────────────────────

interface SynthesisData {
  investment_thesis?: string;
  score?: number;
  recommended_classification?: string;
  classification_reasoning?: string;
  conviction?: string;
  conviction_reasoning?: string;
  time_horizon?: string;
  key_monitor_items?: string[];
  category_verdict?: string;
  signal_alignment?: string;
}

interface FundamentalsData {
  positive_signals?: string[];
  red_flags?: string[];
  key_findings?: string[];
  score?: number;
}

interface RiskData {
  primary_risks?: Array<{ risk: string; severity: string; evidence?: string }>;
  risk_mitigants?: string[];
  tail_risk?: string;
  overall_risk?: string;
}

interface MetricDimension {
  dimension: string;
  score: number;
  weight: number;
  metrics: Array<{
    metric: string;
    rawValue: number | null;
    score: number;
    assessment: string;
  }>;
  flags: string[];
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const pageData = await getCompanyPageData(code);

  if (!pageData) return notFound();

  const { company, analysis, snapshot, sectorMedians: sectorMediansRaw } = pageData;

  // ── Derived data ──────────────────────────────────────────────────────────

  const sectorMedians = sectorMediansRaw ?? { pe: null, roce: null, roe: null, dividendYield: null, marketCap: null };

  const syn = analysis?.llmSynthesis as SynthesisData | null;
  const fund = analysis?.llmFundamentals as FundamentalsData | null;
  const rsk = analysis?.llmRisk as RiskData | null;
  const classSource = String(analysis?.classificationSource ?? 'quant');
  // Check if LLM analysis exists — either data is present or the classification came from AG4
  const isNonEmpty = (v: unknown) => v != null && typeof v === 'object' && Object.keys(v as object).length > 0;
  const hasLlm = isNonEmpty(syn) || isNonEmpty(fund) || isNonEmpty(rsk) || isNonEmpty(analysis?.llmGovernance) || classSource === 'ag4';

  const metricDetails = analysis?.metricDetails as MetricDimension[] | null;
  const convictionReasons = analysis?.convictionReasons as string[] | null;
  const pros = snapshot?.pros as string[] | null;
  const cons = snapshot?.cons as string[] | null;
  const quantClass = String(analysis?.quantClassification ?? '');
  const classification = String(analysis?.classification ?? '');
  const wasOverridden =
    classSource === 'ag4' && quantClass && quantClass !== classification;
  const lynchClass = String(analysis?.lynchClassification ?? '');
  const convLevel = String(analysis?.convictionLevel ?? '');
  const finalScore = Number(analysis?.finalScore ?? 0);

  // ── Catalysts & Risks sources ─────────────────────────────────────────────

  // Positive signals = catalysts; monitor items = watch list (separate from catalysts)
  const llmCatalysts: string[] = [];
  if (fund?.positive_signals) llmCatalysts.push(...fund.positive_signals);

  const llmMonitorItems: string[] = [];
  if (syn?.key_monitor_items) llmMonitorItems.push(...syn.key_monitor_items);

  const llmRisks: string[] = [];
  if (rsk?.primary_risks) {
    for (const r of rsk.primary_risks) {
      llmRisks.push(r.evidence ? `${r.risk} — ${r.evidence}` : r.risk);
    }
  }
  if (rsk?.tail_risk) llmRisks.push(`Tail risk: ${rsk.tail_risk}`);

  // Fallback to snapshot pros/cons when LLM arrays are empty
  const displayCatalysts =
    (hasLlm && llmCatalysts.length > 0) ? llmCatalysts : (pros ?? []);
  const displayRisks =
    (hasLlm && llmRisks.length > 0) ? llmRisks : (cons ?? []);
  const displayMonitorItems = llmMonitorItems;

  // ── Framework preview string ──────────────────────────────────────────────
  const frameworkPreview = [
    analysis?.buffettScore != null ? `Buffett ${Number(analysis.buffettScore).toFixed(0)}` : null,
    analysis?.grahamScore != null ? `Graham ${Number(analysis.grahamScore).toFixed(0)}` : null,
    analysis?.pabraiRiskScore != null ? `Pabrai ${Number(analysis.pabraiRiskScore).toFixed(0)}` : null,
    analysis?.lynchCategoryScore != null ? `Lynch ${Number(analysis.lynchCategoryScore).toFixed(0)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const dimensionTooltips: Record<string, string> = {
    Valuation: 'P/E, P/B, PEG, EV/EBITDA — is it cheap relative to earnings and assets?',
    Quality: 'ROE, ROCE, debt/equity, current ratio, FCF, profit and revenue growth',
    Governance: 'Promoter holding %, pledge %, institutional holding — alignment and oversight',
    Safety: 'Market cap and free float — liquidity and size protection',
    Momentum: 'ROE trend, debt trend, margin trend, promoter holding trend — direction of travel',
  };

  // ── Progressive detail section content ───────────────────────────────────

  const frameworkContent = analysis?.buffettScore ? (
    <FrameworkScores
      buffett={analysis.buffettScore}
      graham={analysis.grahamScore}
      pabrai={analysis.pabraiRiskScore}
      lynch={analysis.lynchCategoryScore}
      lynchCategory={analysis.lynchClassification}
      frameworkDetails={analysis.frameworkDetails}
    />
  ) : (
    <p className="text-sm text-text-muted dark:text-dark-text-muted">No framework data available.</p>
  );

  const hasAgentData = isNonEmpty(syn) || isNonEmpty(fund) || isNonEmpty(rsk) || isNonEmpty(analysis?.llmGovernance);
  const agentContent = hasAgentData ? (
    <AgentAnalysisPanel
      fundamentals={analysis?.llmFundamentals}
      governance={analysis?.llmGovernance}
      risk={analysis?.llmRisk}
      synthesis={analysis?.llmSynthesis}
    />
  ) : hasLlm ? (
    <div className="text-sm text-text-secondary dark:text-dark-text-secondary space-y-2">
      <p>
        AG4 classified this company as <strong className="text-text-primary dark:text-dark-text-primary">{classification}</strong>
        {wasOverridden && <> (overriding quant classification of <span className="text-text-muted dark:text-dark-text-muted">{quantClass}</span>)</>}.
      </p>
      <p className="text-text-muted dark:text-dark-text-muted text-xs">
        Detailed agent outputs are not available for this company. This can happen when the company was classified by the LLM tier but individual agent reports were not stored.
      </p>
    </div>
  ) : (
    <p className="text-sm text-text-muted dark:text-dark-text-muted">
      Quant analysis only — no agent analysis available.
    </p>
  );

  const allMetricsContent = metricDetails && metricDetails.length > 0 ? (
    <div className="space-y-4">
      {metricDetails.map((dim) => (
        <div key={dim.dimension}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-dark-text-muted mb-2 capitalize">
            {dim.dimension}
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted dark:text-dark-text-muted text-xs">
                  <th className="text-left py-1">Metric</th>
                  <th className="text-right py-1">Value</th>
                  <th className="text-right py-1">Score</th>
                  <th className="text-right py-1">Assessment</th>
                </tr>
              </thead>
              <tbody>
                {dim.metrics.map((m) => (
                  <tr key={m.metric} className="border-t border-border dark:border-dark-border">
                    <td className="py-1 text-text-secondary dark:text-dark-text-secondary">{m.metric}</td>
                    <td className="py-1 text-right text-text-primary dark:text-dark-text-primary">
                      {m.rawValue !== null ? m.rawValue : '-'}
                    </td>
                    <td className="py-1 text-right font-medium">{m.score}/100</td>
                    <td
                      className={`py-1 text-right text-xs ${
                        m.assessment === 'excellent'
                          ? 'text-accent-green'
                          : m.assessment === 'good'
                          ? 'text-accent-cyan'
                          : m.assessment === 'acceptable'
                          ? 'text-text-secondary dark:text-dark-text-secondary'
                          : m.assessment === 'poor'
                          ? 'text-accent-amber'
                          : m.assessment === 'red_flag'
                          ? 'text-accent-red'
                          : 'text-text-muted dark:text-dark-text-muted'
                      }`}
                    >
                      {m.assessment.toUpperCase().replace('_', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dim.flags.length > 0 && (
            <div className="mt-2 text-accent-red text-xs">Flags: {dim.flags.join(', ')}</div>
          )}
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-text-muted dark:text-dark-text-muted">No metric details available.</p>
  );

  const financialHealthContent =
    analysis && (analysis.piotroskiFScore != null || analysis.altmanZScore != null) ? (
      <div className="space-y-4">
        {/* Piotroski */}
        {analysis.piotroskiFScore != null && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Piotroski F-Score</span>
              <span
                className={`text-xl font-bold ${
                  Number(analysis.piotroskiFScore) >= 7
                    ? 'text-accent-green'
                    : Number(analysis.piotroskiFScore) <= 3
                    ? 'text-accent-red'
                    : 'text-text-secondary dark:text-dark-text-secondary'
                }`}
              >
                {analysis.piotroskiFScore}/9
              </span>
            </div>
            <p className="text-xs text-text-muted dark:text-dark-text-muted">
              Measures financial strength across 9 criteria covering profitability, leverage, and
              efficiency. Score ≥7 = strong, ≤3 = weak.
            </p>
            <div className="mt-1.5 h-2 bg-bg-secondary dark:bg-dark-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(Number(analysis.piotroskiFScore) / 9) * 100}%`,
                  backgroundColor:
                    Number(analysis.piotroskiFScore) >= 7
                      ? '#2d7a4f'
                      : Number(analysis.piotroskiFScore) <= 3
                      ? '#c0392b'
                      : '#666',
                }}
              />
            </div>
          </div>
        )}
        {/* Altman */}
        {analysis.altmanZScore != null && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Altman Z-Score</span>
              <span
                className={`text-xl font-bold ${
                  Number(analysis.altmanZScore) >= 3
                    ? 'text-accent-green'
                    : Number(analysis.altmanZScore) < 1.8
                    ? 'text-accent-red'
                    : 'text-accent-amber'
                }`}
              >
                {fmt(Number(analysis.altmanZScore))}
              </span>
            </div>
            <p className="text-xs text-text-muted dark:text-dark-text-muted">
              Bankruptcy prediction model. Z ≥3 = safe zone, 1.8–3 = grey zone, &lt;1.8 = distress.
            </p>
          </div>
        )}
        {/* Beneish */}
        {analysis.beneishMScore != null && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Beneish M-Score</span>
              <span
                className={`text-xl font-bold ${
                  Number(analysis.beneishMScore) > -1.78
                    ? 'text-accent-red'
                    : 'text-accent-green'
                }`}
              >
                {fmt(Number(analysis.beneishMScore))}
              </span>
            </div>
            <p className="text-xs text-text-muted dark:text-dark-text-muted">
              Earnings manipulation detector. Score &gt;-1.78 suggests possible manipulation. Lower
              (more negative) is cleaner.
            </p>
          </div>
        )}
      </div>
    ) : (
      <p className="text-sm text-text-muted dark:text-dark-text-muted">
        No financial health scores available.
      </p>
    );

  const financialHealthPreview = [
    analysis?.piotroskiFScore != null ? `Piotroski ${analysis.piotroskiFScore}/9` : null,
    analysis?.altmanZScore != null ? `Altman ${fmt(Number(analysis.altmanZScore))}` : null,
    analysis?.beneishMScore != null ? `Beneish ${fmt(Number(analysis.beneishMScore))}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const progressiveSections = [
    {
      title: 'Framework Scores',
      preview: frameworkPreview || 'No frameworks',
      content: frameworkContent,
    },
    {
      title: 'Agent Analysis',
      preview: hasAgentData
        ? `4 agents · ${classSource === 'ag4' ? 'AG4 override' : 'Quant baseline'}`
        : hasLlm
        ? `AG4 classified · ${wasOverridden ? 'override applied' : 'confirmed quant'}`
        : 'Quant analysis only',
      content: agentContent,
    },
    {
      title: 'All Metrics',
      preview: '21 metrics across 5 dimensions',
      content: allMetricsContent,
    },
    {
      title: 'Financial Health',
      preview: financialHealthPreview || 'Piotroski · Altman · Beneish',
      content: financialHealthContent,
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl space-y-8">
      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-2xl font-bold text-text-primary dark:text-dark-text-primary">
                {company.name}
              </h1>
              {lynchClass && <LynchBadge category={lynchClass} />}
              {convLevel && <ConvictionBadge level={convLevel} />}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted dark:text-dark-text-muted mt-1">
              {company.sector && <span>{company.sector}</span>}
              {company.bseCode && <span>BSE: {company.bseCode}</span>}
              {company.nseCode && <span>NSE: {company.nseCode}</span>}
              {!company.bseCode && !company.nseCode && (
                <span>{company.screenerCode}</span>
              )}
            </div>
          </div>
          <WatchlistButton code={company.screenerCode} size="md" />
        </div>
      </div>

      {/* ── 2. Score Cards Row ────────────────────────────────────────────── */}
      {analysis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Final Score"
            value={`${finalScore.toFixed(0)}/100`}
            color={scoreColor(finalScore)}
            subtext="Geometric mean of 5 dimension scores"
          />
          <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-4">
            <div className="text-text-muted dark:text-dark-text-muted text-xs uppercase tracking-wider flex items-center gap-2 mb-1">
              Classification
              {classSource === 'ag4' && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-cyan/20 text-accent-cyan normal-case tracking-normal">
                  AG4
                </span>
              )}
              {classSource === 'quant' && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-bg-secondary dark:bg-dark-bg-secondary text-text-muted dark:text-dark-text-muted normal-case tracking-normal">
                  QUANT
                </span>
              )}
            </div>
            <div className={`text-xl font-bold ${classificationColor(classification)}`}>
              {classification.toUpperCase().replace(/_/g, ' ') || 'N/A'}
            </div>
            {wasOverridden && (
              <div className="text-xs text-text-muted dark:text-dark-text-muted mt-1">
                Quant: {quantClass.toUpperCase().replace(/_/g, ' ')}
              </div>
            )}
          </div>
          <StatCard
            label="Overall Rank"
            value={analysis.rankOverall != null ? `#${analysis.rankOverall}` : '-'}
          />
          <StatCard
            label="Sector Rank"
            value={analysis.rankInSector != null ? `#${analysis.rankInSector}` : '-'}
            subtext={company.sector ?? undefined}
          />
        </div>
      )}

      {/* ── 3. Narrative Verdict (LLM-only) ──────────────────────────────── */}
      {hasLlm && syn?.investment_thesis && (
        <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg p-5">
          <h2 className="text-text-muted dark:text-dark-text-muted text-xs uppercase tracking-wider mb-3">
            Investment Thesis
          </h2>
          <p className="text-sm text-text-secondary dark:text-dark-text-secondary leading-relaxed">
            {syn.investment_thesis}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted dark:text-dark-text-muted border-t border-border dark:border-dark-border pt-3">
            {displayCatalysts.length > 0 && (
              <span className="text-accent-green">
                {displayCatalysts.length} catalyst{displayCatalysts.length !== 1 ? 's' : ''}
              </span>
            )}
            {displayRisks.length > 0 && (
              <span className="text-accent-red">
                {displayRisks.length} risk{displayRisks.length !== 1 ? 's' : ''}
              </span>
            )}
            {convLevel && (
              <span>
                Conviction:{' '}
                <span
                  className={
                    convLevel === 'high'
                      ? 'text-accent-green font-medium'
                      : convLevel === 'medium'
                      ? 'text-accent-cyan font-medium'
                      : 'text-text-secondary dark:text-dark-text-secondary'
                  }
                >
                  {convLevel.toUpperCase()}
                </span>
              </span>
            )}
            {syn.time_horizon && <span>Horizon: {syn.time_horizon}</span>}
          </div>
          {convictionReasons && convictionReasons.length > 0 && (
            <div className="mt-3 space-y-1">
              {convictionReasons.map((r, i) => (
                <div key={i} className="text-xs text-text-secondary dark:text-dark-text-secondary">
                  — {r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 4. Key Metrics Strip ──────────────────────────────────────────── */}
      {snapshot && (
        <MetricStrip
          metrics={[
            {
              key: 'pe',
              value: snapshot.stockPe != null ? Number(snapshot.stockPe) : null,
              sectorMedian: sectorMedians.pe,
            },
            {
              key: 'roce',
              value: snapshot.roce != null ? Number(snapshot.roce) : null,
              sectorMedian: sectorMedians.roce,
            },
            {
              key: 'roe',
              value: snapshot.roe != null ? Number(snapshot.roe) : null,
              sectorMedian: sectorMedians.roe,
            },
            {
              key: 'piotroski',
              value:
                analysis?.piotroskiFScore != null ? Number(analysis.piotroskiFScore) : null,
              sectorMedian: null,
            },
            {
              key: 'marketCap',
              value: snapshot.marketCap != null ? Number(snapshot.marketCap) : null,
              sectorMedian: sectorMedians.marketCap,
            },
            {
              key: 'dividendYield',
              value: snapshot.dividendYield != null ? Number(snapshot.dividendYield) : null,
              sectorMedian: sectorMedians.dividendYield,
            },
          ]}
        />
      )}

      {/* ── 5. Catalysts & Risks ──────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Disqualification banner */}
        {analysis?.disqualified && (
          <div className="bg-accent-red/10 dark:bg-accent-red/10 border border-accent-red rounded-lg p-4">
            <div className="text-accent-red font-bold text-sm mb-1">DISQUALIFIED</div>
            <div className="text-sm text-text-secondary dark:text-dark-text-secondary space-y-0.5">
              {(analysis.disqualificationReasons as string[])?.map((r, i) => (
                <div key={i}>— {r}</div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Catalysts */}
          <div className="bg-bg-card dark:bg-dark-bg-card border border-accent-green/30 dark:border-accent-green/30 rounded-lg p-4">
            <h3 className="text-accent-green text-xs font-semibold uppercase tracking-wider mb-3">
              Catalysts
            </h3>
            {displayCatalysts.length > 0 ? (
              <ul className="space-y-1.5">
                {displayCatalysts.map((c, i) => (
                  <li key={i} className="text-sm text-text-secondary dark:text-dark-text-secondary flex gap-2">
                    <span className="text-accent-green/60 mt-0.5 shrink-0">+</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted dark:text-dark-text-muted">No catalysts identified.</p>
            )}
          </div>

          {/* Risks */}
          <div className="bg-bg-card dark:bg-dark-bg-card border border-accent-red/30 dark:border-accent-red/30 rounded-lg p-4">
            <h3 className="text-accent-red text-xs font-semibold uppercase tracking-wider mb-3">
              Risks
            </h3>
            {displayRisks.length > 0 ? (
              <ul className="space-y-1.5">
                {displayRisks.map((r, i) => (
                  <li key={i} className="text-sm text-text-secondary dark:text-dark-text-secondary flex gap-2">
                    <span className="text-accent-red/60 mt-0.5 shrink-0">−</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted dark:text-dark-text-muted">No risks identified.</p>
            )}
          </div>
        </div>

        {/* Monitor Items — things to watch, separate from catalysts */}
        {displayMonitorItems.length > 0 && (
          <div className="bg-bg-card dark:bg-dark-bg-card border border-accent-amber/30 rounded-lg p-4 mt-4">
            <h3 className="text-accent-amber text-xs font-semibold uppercase tracking-wider mb-3">
              Key Items to Monitor
            </h3>
            <ul className="space-y-1.5">
              {displayMonitorItems.map((item, i) => (
                <li key={i} className="text-sm text-text-secondary dark:text-dark-text-secondary flex gap-2">
                  <span className="text-accent-amber/60 mt-0.5 shrink-0">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── 6. Progressive Detail Sections ───────────────────────────────── */}
      {analysis && (
        <ProgressiveSections sections={progressiveSections} />
      )}
    </div>
  );
}
