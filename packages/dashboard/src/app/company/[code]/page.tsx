import { getCompanyDetail } from '@/lib/queries';
import { StatCard } from '@/components/stat-card';
import { LynchBadge } from '@/components/lynch-badge';
import { ConvictionBadge } from '@/components/conviction-badge';
import { FrameworkScores } from '@/components/framework-scores';
import { AgentAnalysisPanel } from '@/components/agent-analysis-panel';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function scoreColor(score: number): string {
  if (score >= 80) return 'text-accent-green';
  if (score >= 65) return 'text-accent-cyan';
  if (score >= 40) return 'text-text-secondary';
  if (score >= 20) return 'text-accent-amber';
  return 'text-accent-red';
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const detail = await getCompanyDetail(code);

  if (!detail) return notFound();

  const { company, analysis, snapshot } = detail;

  const dimensions = [
    { name: 'Valuation', score: analysis?.valuationScore, weight: 25 },
    { name: 'Quality', score: analysis?.qualityScore, weight: 30 },
    { name: 'Governance', score: analysis?.governanceScore, weight: 20 },
    { name: 'Safety', score: analysis?.safetyScore, weight: 15 },
    { name: 'Momentum', score: analysis?.momentumScore, weight: 10 },
  ];

  const llm = analysis?.llmAnalysis as {
    trendNarrative?: string;
    riskFactors?: string[];
    catalysts?: string[];
    reasoning?: string;
    confidence?: string;
    qualitativeAdjustment?: number;
  } | null;

  const metricDetails = analysis?.metricDetails as Array<{
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
  }> | null;

  const convictionReasons = analysis?.convictionReasons as string[] | null;
  const isHighConviction = String(analysis?.convictionLevel) === 'high';
  const lynchClass = String(analysis?.lynchClassification ?? '');
  const convLevel = String(analysis?.convictionLevel ?? '');
  const classSource = String(analysis?.classificationSource ?? 'quant');
  const quantClass = String(analysis?.quantClassification ?? '');
  const wasOverridden = classSource === 'ag4' && quantClass && quantClass !== analysis?.classification;

  const dimensionTooltips: Record<string, string> = {
    'Valuation': 'P/E, P/B, PEG, EV/EBITDA — is it cheap relative to earnings and assets?',
    'Quality': 'ROE, ROCE, debt/equity, current ratio, FCF, profit and revenue growth',
    'Governance': 'Promoter holding %, pledge %, institutional holding — alignment and oversight',
    'Safety': 'Market cap and free float — liquidity and size protection',
    'Momentum': 'ROE trend, debt trend, margin trend, promoter holding trend — direction of travel',
  };

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{company.name}</h1>
          {lynchClass && <LynchBadge category={lynchClass} />}
          {convLevel && <ConvictionBadge level={convLevel} />}
        </div>
        <div className="flex gap-4 text-sm text-text-muted mt-1">
          <span>{company.screenerCode}</span>
          {company.bseCode && <span>BSE: {company.bseCode}</span>}
          {company.nseCode && <span>NSE: {company.nseCode}</span>}
          {company.sector && <span>{company.sector}</span>}
        </div>
      </div>

      {/* Score Overview */}
      {analysis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Final Score"
            value={Number(analysis.finalScore ?? 0).toFixed(0)}
            color={scoreColor(Number(analysis.finalScore ?? 0))}
            subtext="Geometric mean of 5 dimension scores"
          />
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <div className="text-text-muted text-xs uppercase tracking-wider flex items-center gap-2">
              Classification
              {classSource === 'ag4' && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-cyan/20 text-accent-cyan normal-case tracking-normal">
                  AG4
                </span>
              )}
              {classSource === 'quant' && (
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-bg-secondary text-text-muted normal-case tracking-normal">
                  QUANT
                </span>
              )}
            </div>
            <div className="text-xl font-bold mt-1">
              {(analysis.classification ?? 'N/A').toUpperCase().replace('_', ' ')}
            </div>
            {wasOverridden && (
              <div className="text-xs text-text-muted mt-1">
                Quant: {quantClass.toUpperCase().replace('_', ' ')}
              </div>
            )}
          </div>
          <StatCard label="Rank (Overall)" value={`#${analysis.rankOverall ?? '-'}`} />
          <StatCard label="Rank (Sector)" value={`#${analysis.rankInSector ?? '-'}`} />
        </div>
      )}

      {/* Conviction Reasons */}
      {isHighConviction && convictionReasons && convictionReasons.length > 0 ? (
        <div className="bg-bg-card border border-accent-green/30 rounded-lg p-4">
          <div className="text-accent-green font-bold text-sm mb-2">HIGH CONVICTION REASONS</div>
          <ul className="text-sm text-text-secondary space-y-1">
            {convictionReasons.map((r, i) => <li key={i}>- {r}</li>)}
          </ul>
        </div>
      ) : null}

      {/* LLM Summary (shown prominently when available) */}
      {llm?.trendNarrative && (
        <div className="bg-bg-card border border-border rounded-lg p-5">
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">LLM Summary</h2>
          <div className="text-sm text-text-secondary leading-relaxed mb-3">{llm.trendNarrative}</div>
          {llm.catalysts && llm.catalysts.length > 0 && (
            <div className="mb-3">
              <div className="text-accent-green text-xs font-medium mb-1">Catalysts</div>
              <ul className="text-sm text-text-secondary space-y-0.5">
                {llm.catalysts.map((c, i) => <li key={i}>- {c}</li>)}
              </ul>
            </div>
          )}
          {llm.riskFactors && llm.riskFactors.length > 0 && (
            <div className="mb-3">
              <div className="text-accent-red text-xs font-medium mb-1">Risk Factors</div>
              <ul className="text-sm text-text-secondary space-y-0.5">
                {llm.riskFactors.map((r, i) => <li key={i}>- {r}</li>)}
              </ul>
            </div>
          )}
          <div className="flex gap-4 text-xs text-text-muted border-t border-border pt-2">
            {llm.confidence && <span>Confidence: <span className="text-text-secondary">{llm.confidence}</span></span>}
            {llm.qualitativeAdjustment !== undefined && (
              <span>Adjustment: <span className={llm.qualitativeAdjustment > 0 ? 'text-accent-green' : llm.qualitativeAdjustment < 0 ? 'text-accent-red' : 'text-text-secondary'}>
                {llm.qualitativeAdjustment > 0 ? '+' : ''}{llm.qualitativeAdjustment}
              </span></span>
            )}
          </div>
        </div>
      )}

      {/* Multi-Agent Analysis (detailed tabs) */}
      {analysis && (analysis.llmFundamentals || analysis.llmSynthesis) ? (
        <AgentAnalysisPanel
          fundamentals={analysis.llmFundamentals}
          governance={analysis.llmGovernance}
          risk={analysis.llmRisk}
          synthesis={analysis.llmSynthesis}
        />
      ) : null}

      {/* Framework Scores */}
      {analysis?.buffettScore ? (
        <FrameworkScores
          buffett={analysis.buffettScore}
          graham={analysis.grahamScore}
          pabrai={analysis.pabraiRiskScore}
          lynch={analysis.lynchCategoryScore}
          lynchCategory={analysis.lynchClassification}
          frameworkDetails={analysis.frameworkDetails}
        />
      ) : null}

      {/* Financial Health Scores (v3) */}
      {analysis && (analysis.piotroskiFScore != null || analysis.altmanZScore != null) && (
        <div>
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Financial Health</h2>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Piotroski F-Score"
              value={analysis.piotroskiFScore != null ? `${analysis.piotroskiFScore}/9` : '-'}
              color={Number(analysis.piotroskiFScore ?? 0) >= 7 ? 'text-accent-green' : Number(analysis.piotroskiFScore ?? 0) <= 3 ? 'text-accent-red' : 'text-text-secondary'}
              subtext={Number(analysis.piotroskiFScore ?? 0) >= 7 ? 'Strong fundamentals (profitability, leverage, efficiency)' : Number(analysis.piotroskiFScore ?? 0) <= 3 ? 'Weak fundamentals — multiple criteria failing' : 'Mixed fundamentals — some criteria passing'}
            />
            <StatCard
              label="Altman Z-Score"
              value={analysis.altmanZScore != null ? Number(analysis.altmanZScore).toFixed(1) : '-'}
              color={Number(analysis.altmanZScore ?? 0) >= 3 ? 'text-accent-green' : Number(analysis.altmanZScore ?? 0) < 1.8 ? 'text-accent-red' : 'text-accent-amber'}
              subtext={Number(analysis.altmanZScore ?? 0) >= 3 ? 'Low bankruptcy risk' : Number(analysis.altmanZScore ?? 0) < 1.8 ? 'Elevated bankruptcy risk' : 'Inconclusive bankruptcy prediction'}
            />
            <StatCard
              label="Beneish M-Score"
              value={analysis.beneishMScore != null ? Number(analysis.beneishMScore).toFixed(1) : '-'}
              color={Number(analysis.beneishMScore ?? 0) > -1.78 ? 'text-accent-red' : 'text-accent-green'}
              subtext={Number(analysis.beneishMScore ?? 0) > -1.78 ? 'Accounting patterns suggest possible manipulation' : 'No signs of earnings manipulation'}
            />
          </div>
        </div>
      )}

      {/* Dimension Scores */}
      {analysis && (
        <div>
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Dimension Scores</h2>
          <div className="grid grid-cols-5 gap-3">
            {dimensions.map((d) => {
              const score = Number(d.score ?? 0);
              return (
                <div key={d.name} className="bg-bg-card border border-border rounded-lg p-3 text-center">
                  <div className="text-text-muted text-xs mb-1" title={dimensionTooltips[d.name] ?? ''}>{d.name} ({d.weight}%)</div>
                  <div className={`text-xl font-bold ${scoreColor(score)}`}>{score}</div>
                  <div className="mt-2 h-2 bg-bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${score}%`,
                        backgroundColor: score >= 80 ? '#2d7a4f' : score >= 65 ? '#b85a3b' : score >= 40 ? '#666666' : score >= 20 ? '#b8860b' : '#c0392b',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legacy LLM reasoning (only if no structured llmAnalysis) */}
      {llm?.reasoning && !llm?.trendNarrative ? (
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-2">LLM Reasoning</h2>
          <div className="text-sm text-text-secondary">{llm.reasoning}</div>
        </div>
      ) : null}

      {/* Metric Details */}
      {metricDetails && metricDetails.length > 0 && (
        <div>
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Metric Details</h2>
          <div className="space-y-4">
            {metricDetails.map((dim) => (
              <div key={dim.dimension} className="bg-bg-card border border-border rounded-lg p-4">
                <h3 className="text-sm font-medium mb-2 capitalize">{dim.dimension}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-text-muted text-xs">
                        <th className="text-left py-1" title="Individual metric scored 0-100 with sector-specific thresholds">Metric</th>
                        <th className="text-right py-1" title="Raw value from financial data">Value</th>
                        <th className="text-right py-1" title="Normalized score (0-100) based on sector-adjusted thresholds">Score</th>
                        <th className="text-right py-1" title="excellent (>=85), good (>=70), acceptable (>=45), poor (>=15), red_flag (<15)">Assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dim.metrics.map((m) => (
                        <tr key={m.metric} className="border-t border-border">
                          <td className="py-1 text-text-secondary">{m.metric}</td>
                          <td className="py-1 text-right">{m.rawValue !== null ? m.rawValue : '-'}</td>
                          <td className="py-1 text-right font-medium">{m.score}</td>
                          <td className={`py-1 text-right text-xs ${
                            m.assessment === 'excellent' ? 'text-accent-green' :
                            m.assessment === 'good' ? 'text-accent-cyan' :
                            m.assessment === 'acceptable' ? 'text-text-secondary' :
                            m.assessment === 'poor' ? 'text-accent-amber' :
                            m.assessment === 'red_flag' ? 'text-accent-red' :
                            'text-text-muted'
                          }`}>
                            {m.assessment.toUpperCase().replace('_', ' ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dim.flags.length > 0 && (
                  <div className="mt-2 text-accent-red text-xs">
                    Flags: {dim.flags.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Metrics from Snapshot */}
      {snapshot && (
        <div>
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Key Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {snapshot.marketCap && (
              <StatCard label="Market Cap (Cr)" value={Number(snapshot.marketCap).toLocaleString('en-IN')} />
            )}
            {snapshot.currentPrice && (
              <StatCard label="Price" value={`₹${Number(snapshot.currentPrice).toLocaleString('en-IN')}`} />
            )}
            {snapshot.stockPe && (
              <StatCard label="P/E" value={Number(snapshot.stockPe).toFixed(1)} />
            )}
            {snapshot.bookValue && (
              <StatCard label="Book Value" value={Number(snapshot.bookValue).toFixed(1)} />
            )}
            {snapshot.roce && (
              <StatCard label="ROCE %" value={Number(snapshot.roce).toFixed(1)} />
            )}
            {snapshot.roe && (
              <StatCard label="ROE %" value={Number(snapshot.roe).toFixed(1)} />
            )}
            {snapshot.dividendYield && (
              <StatCard label="Div Yield %" value={Number(snapshot.dividendYield).toFixed(2)} />
            )}
          </div>
        </div>
      )}

      {/* Disqualification */}
      {analysis?.disqualified && (
        <div className="bg-bg-card border border-accent-red rounded-lg p-4">
          <div className="text-accent-red font-bold text-sm mb-2">DISQUALIFIED</div>
          <div className="text-sm">
            {(analysis.disqualificationReasons as string[])?.map((r, i) => (
              <div key={i}>- {r}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
