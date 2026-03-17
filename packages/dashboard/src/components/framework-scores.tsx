function scoreColor(score: number): string {
  if (score >= 75) return 'text-accent-green';
  if (score >= 55) return 'text-accent-cyan';
  if (score >= 35) return 'text-text-secondary';
  if (score >= 20) return 'text-accent-amber';
  return 'text-accent-red';
}

function barColor(score: number): string {
  if (score >= 75) return '#2d7a4f';
  if (score >= 55) return '#b85a3b';
  if (score >= 35) return '#666666';
  if (score >= 20) return '#b8860b';
  return '#c0392b';
}

interface FrameworkScoresProps {
  buffett: string | null;
  graham: string | null;
  pabrai: string | null;
  lynch: string | null;
  lynchCategory: string | null;
  frameworkDetails?: unknown;
}

export function FrameworkScores({ buffett, graham, pabrai, lynch, lynchCategory, frameworkDetails }: FrameworkScoresProps) {
  const frameworks = [
    { name: 'Buffett', score: buffett, description: 'Moat & quality' },
    { name: 'Graham', score: graham, description: 'Value screen' },
    { name: 'Pabrai', score: pabrai, description: 'Risk (100=safest)' },
    { name: `Lynch (${(lynchCategory ?? 'N/A').replace('_', ' ')})`, score: lynch, description: 'Category fit' },
  ];

  const details = frameworkDetails as {
    buffett?: { passCount?: number; totalCriteria?: number; moatIndicators?: string[] };
    graham?: { passCount?: number; totalCriteria?: number; grahamNumber?: number; marginOfSafety?: number };
    pabrai?: { overallRisk?: string; factors?: Array<{ name: string; score: number }> };
    lynch?: { category?: string; rationale?: string };
  } | null;

  return (
    <div>
      <h2 className="text-text-muted text-xs uppercase tracking-wider mb-3">Framework Scores</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {frameworks.map((f) => {
          const score = Number(f.score ?? 0);
          return (
            <div key={f.name} className="bg-bg-card border border-border rounded-lg p-3">
              <div className="text-text-muted text-xs mb-1">{f.name}</div>
              <div className={`text-2xl font-bold ${scoreColor(score)}`}>{f.score ? score : '-'}</div>
              <div className="text-text-muted text-xs mt-0.5">{f.description}</div>
              <div className="mt-2 h-2 bg-bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${score}%`, backgroundColor: barColor(score) }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail breakdowns */}
      {details && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {details.buffett && (
            <div className="bg-bg-card border border-border rounded-lg p-3">
              <div className="text-text-muted text-xs mb-2">Buffett Detail</div>
              <div className="text-sm text-text-secondary">
                Criteria passed: {details.buffett.passCount ?? '-'}/{details.buffett.totalCriteria ?? 10}
              </div>
              {details.buffett.moatIndicators && details.buffett.moatIndicators.length > 0 && (
                <div className="mt-1">
                  <div className="text-xs text-accent-green">Moat indicators:</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    {details.buffett.moatIndicators.join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}
          {details.graham && (
            <div className="bg-bg-card border border-border rounded-lg p-3">
              <div className="text-text-muted text-xs mb-2">Graham Detail</div>
              <div className="text-sm text-text-secondary">
                Criteria passed: {details.graham.passCount ?? '-'}/{details.graham.totalCriteria ?? 10}
              </div>
              {details.graham.grahamNumber != null && (
                <div className="text-xs text-text-secondary mt-1">
                  Graham Number: {details.graham.grahamNumber.toFixed(0)}
                  {details.graham.marginOfSafety != null && (
                    <span className={details.graham.marginOfSafety > 0 ? ' text-accent-green' : ' text-accent-red'}>
                      {' '}({details.graham.marginOfSafety > 0 ? '+' : ''}{(details.graham.marginOfSafety * 100).toFixed(0)}% margin)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {details.pabrai && (
            <div className="bg-bg-card border border-border rounded-lg p-3">
              <div className="text-text-muted text-xs mb-2">Pabrai Risk Detail</div>
              <div className="text-sm text-text-secondary">
                Overall risk: <span className={
                  details.pabrai.overallRisk === 'low' ? 'text-accent-green' :
                  details.pabrai.overallRisk === 'moderate' ? 'text-accent-cyan' :
                  details.pabrai.overallRisk === 'elevated' ? 'text-accent-amber' :
                  'text-accent-red'
                }>{details.pabrai.overallRisk?.toUpperCase()}</span>
              </div>
            </div>
          )}
          {details.lynch && (
            <div className="bg-bg-card border border-border rounded-lg p-3">
              <div className="text-text-muted text-xs mb-2">Lynch Detail</div>
              <div className="text-sm text-text-secondary">
                Category: {details.lynch.category?.replace('_', ' ')}
              </div>
              {details.lynch.rationale && (
                <div className="text-xs text-text-muted mt-1">{details.lynch.rationale}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
