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
          />
          <StatCard
            label="Classification"
            value={(analysis.classification ?? 'N/A').toUpperCase().replace('_', ' ')}
          />
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

      {/* Dimension Scores */}
      {analysis && (
        <div>
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Dimension Scores</h2>
          <div className="grid grid-cols-5 gap-3">
            {dimensions.map((d) => {
              const score = Number(d.score ?? 0);
              return (
                <div key={d.name} className="bg-bg-card border border-border rounded-lg p-3 text-center">
                  <div className="text-text-muted text-xs mb-1">{d.name} ({d.weight}%)</div>
                  <div className={`text-xl font-bold ${scoreColor(score)}`}>{score}</div>
                  <div className="mt-2 h-2 bg-bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${score}%`,
                        backgroundColor: score >= 80 ? '#00e676' : score >= 65 ? '#00e5ff' : score >= 40 ? '#8888a0' : score >= 20 ? '#ffab00' : '#ff1744',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Multi-Agent LLM Analysis */}
      {analysis && (analysis.llmFundamentals || analysis.llmSynthesis) ? (
        <AgentAnalysisPanel
          fundamentals={analysis.llmFundamentals}
          governance={analysis.llmGovernance}
          risk={analysis.llmRisk}
          synthesis={analysis.llmSynthesis}
        />
      ) : null}

      {/* Legacy LLM Analysis (for companies with only single-shot LLM) */}
      {llm && !analysis?.llmSynthesis ? (
        <div>
          <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">LLM Analysis</h2>
          <div className="bg-bg-card border border-border rounded-lg p-4 space-y-3">
            {llm.trendNarrative && (
              <div>
                <div className="text-text-muted text-xs mb-1">Trend Narrative</div>
                <div className="text-sm">{llm.trendNarrative}</div>
              </div>
            )}
            {llm.riskFactors && llm.riskFactors.length > 0 && (
              <div>
                <div className="text-accent-red text-xs mb-1">Risk Factors</div>
                <ul className="text-sm space-y-1">
                  {llm.riskFactors.map((r, i) => <li key={i}>- {r}</li>)}
                </ul>
              </div>
            )}
            {llm.catalysts && llm.catalysts.length > 0 && (
              <div>
                <div className="text-accent-green text-xs mb-1">Catalysts</div>
                <ul className="text-sm space-y-1">
                  {llm.catalysts.map((c, i) => <li key={i}>- {c}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-6 text-xs text-text-muted border-t border-border pt-2">
              {llm.confidence && <span>Confidence: {llm.confidence}</span>}
              {llm.qualitativeAdjustment !== undefined && (
                <span>Adjustment: {llm.qualitativeAdjustment > 0 ? '+' : ''}{llm.qualitativeAdjustment}</span>
              )}
              {llm.reasoning && <span>{llm.reasoning}</span>}
            </div>
          </div>
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
                        <th className="text-left py-1">Metric</th>
                        <th className="text-right py-1">Value</th>
                        <th className="text-right py-1">Score</th>
                        <th className="text-right py-1">Assessment</th>
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
