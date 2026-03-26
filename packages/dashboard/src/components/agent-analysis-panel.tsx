'use client';

import { useState } from 'react';

interface AgentPanelProps {
  fundamentals: unknown;
  governance: unknown;
  risk: unknown;
  synthesis: unknown;
}

interface FundamentalsData {
  trend_assessment?: string;
  earnings_quality?: string;
  key_findings?: string[];
  red_flags?: string[];
  positive_signals?: string[];
  score?: number;
  adjustment?: number; // Legacy compat
  confidence?: string;
  reasoning?: string;
}

interface GovernanceData {
  governance_quality?: string;
  promoter_assessment?: string;
  institutional_signal?: string;
  key_findings?: string[];
  governance_risks?: string[];
  positive_signals?: string[];
  adjustment?: number;
  confidence?: string;
  reasoning?: string;
}

interface RiskData {
  overall_risk?: string;
  primary_risks?: Array<{ risk: string; severity: string; evidence?: string }>;
  risk_mitigants?: string[];
  tail_risk?: string;
  key_findings?: string[];
  adjustment?: number;
  confidence?: string;
  reasoning?: string;
}

interface SynthesisData {
  investment_thesis?: string;
  score?: number;
  recommended_classification?: string;
  classification_reasoning?: string;
  final_adjustment?: number; // Legacy compat
  conviction?: string;
  conviction_reasoning?: string;
  time_horizon?: string;
  key_monitor_items?: string[];
  category_verdict?: string;
  signal_alignment?: string;
}

function riskColor(risk: string | undefined): string {
  switch (risk) {
    case 'low': return 'text-accent-green';
    case 'moderate': return 'text-accent-cyan';
    case 'elevated': return 'text-accent-amber';
    case 'high':
    case 'extreme': return 'text-accent-red';
    default: return 'text-text-muted';
  }
}

function qualityColor(quality: string | undefined): string {
  switch (quality) {
    case 'strong': case 'high': return 'text-accent-green';
    case 'adequate': case 'medium': return 'text-accent-cyan';
    case 'weak': case 'low': return 'text-accent-amber';
    case 'red_flag': return 'text-accent-red';
    default: return 'text-text-muted';
  }
}

const tabs = ['Synthesis', 'Fundamentals', 'Governance', 'Risk'] as const;

export function AgentAnalysisPanel({ fundamentals, governance, risk, synthesis }: AgentPanelProps) {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>('Synthesis');

  const fund = fundamentals as FundamentalsData | null;
  const gov = governance as GovernanceData | null;
  const rsk = risk as RiskData | null;
  const syn = synthesis as SynthesisData | null;

  const hasAny = fund || gov || rsk || syn;
  if (!hasAny) return null;

  const visibleTabs = tabs.filter((tab) => {
    const data = tab === 'Synthesis' ? syn : tab === 'Fundamentals' ? fund : tab === 'Governance' ? gov : rsk;
    return !!data;
  });

  const handleTabKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let newIndex = -1;
    if (e.key === 'ArrowRight') {
      newIndex = (currentIndex + 1) % visibleTabs.length;
    } else if (e.key === 'ArrowLeft') {
      newIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
    } else if (e.key === 'Home') {
      newIndex = 0;
    } else if (e.key === 'End') {
      newIndex = visibleTabs.length - 1;
    }

    if (newIndex >= 0) {
      e.preventDefault();
      setActiveTab(visibleTabs[newIndex]);
      // Focus the new tab button
      const buttons = e.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
      (buttons?.[newIndex] as HTMLElement)?.focus();
    }
  };

  return (
    <div>
      <h2 className="text-text-muted dark:text-dark-text-muted text-xs uppercase tracking-wider mb-3">Multi-Agent LLM Analysis</h2>
      <div className="bg-bg-card dark:bg-dark-bg-card border border-border dark:border-dark-border rounded-lg overflow-hidden">
        {/* Tabs */}
        <div role="tablist" className="flex border-b border-border dark:border-dark-border">
          {tabs.map((tab, index) => {
            const data = tab === 'Synthesis' ? syn : tab === 'Fundamentals' ? fund : tab === 'Governance' ? gov : rsk;
            if (!data) return null;
            const visibleIndex = visibleTabs.indexOf(tab);
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`panel-${tab.toLowerCase()}`}
                id={`tab-${tab.toLowerCase()}`}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(e) => handleTabKeyDown(e, visibleIndex)}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-accent-cyan border-b-2 border-accent-cyan bg-bg-hover dark:bg-dark-bg-hover'
                    : 'text-text-muted dark:text-dark-text-muted hover:text-text-secondary dark:hover:text-dark-text-secondary'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Panel Content */}
        <div
          role="tabpanel"
          id={`panel-${activeTab.toLowerCase()}`}
          aria-labelledby={`tab-${activeTab.toLowerCase()}`}
          className="p-4 space-y-3"
        >
          {activeTab === 'Synthesis' && syn && (
            <>
              {syn.investment_thesis && (
                <div>
                  <div className="text-text-muted dark:text-dark-text-muted text-xs mb-1">Investment Thesis</div>
                  <div className="text-sm text-text-primary dark:text-dark-text-primary">{syn.investment_thesis}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-text-secondary dark:text-dark-text-secondary">
                {syn.score != null && (
                  <span>AG4 Score: <span className="text-accent-cyan font-bold">{syn.score}</span></span>
                )}
                {syn.recommended_classification && (
                  <span>Classification: <span className="font-medium">{syn.recommended_classification.toUpperCase().replace('_', ' ')}</span></span>
                )}
                {syn.conviction && (
                  <span>Conviction: <span className={qualityColor(syn.conviction)}>{syn.conviction.toUpperCase()}</span></span>
                )}
                {syn.signal_alignment && (
                  <span>Signal Alignment: <span className={
                    syn.signal_alignment === 'aligned' ? 'text-accent-green' :
                    syn.signal_alignment === 'mixed' ? 'text-accent-amber' :
                    'text-accent-red'
                  }>{syn.signal_alignment.toUpperCase()}</span></span>
                )}
                {syn.time_horizon && <span>Horizon: {syn.time_horizon}</span>}
              </div>
              {syn.classification_reasoning && (
                <div className="text-xs text-text-secondary dark:text-dark-text-secondary border-l-2 border-accent-cyan/30 pl-2">{syn.classification_reasoning}</div>
              )}
              {syn.conviction_reasoning && (
                <div className="text-xs text-text-secondary dark:text-dark-text-secondary border-t border-border dark:border-dark-border pt-2">{syn.conviction_reasoning}</div>
              )}
              {syn.category_verdict && (
                <div className="text-xs text-text-secondary dark:text-dark-text-secondary">Category verdict: {syn.category_verdict}</div>
              )}
              {syn.key_monitor_items && syn.key_monitor_items.length > 0 && (
                <div>
                  <div className="text-text-muted dark:text-dark-text-muted text-xs mb-1">Monitor Items</div>
                  <ul className="text-xs text-text-secondary dark:text-dark-text-secondary space-y-0.5">
                    {syn.key_monitor_items.map((item, i) => <li key={i}>- {item}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}

          {activeTab === 'Fundamentals' && fund && (
            <>
              <div className="flex flex-wrap gap-4 text-xs text-text-secondary dark:text-dark-text-secondary">
                {fund.trend_assessment && (
                  <span>Trend: <span className={
                    fund.trend_assessment === 'improving' ? 'text-accent-green' :
                    fund.trend_assessment === 'stable' ? 'text-accent-cyan' :
                    'text-accent-red'
                  }>{fund.trend_assessment.toUpperCase()}</span></span>
                )}
                {fund.earnings_quality && (
                  <span>Earnings Quality: <span className={qualityColor(fund.earnings_quality)}>{fund.earnings_quality.toUpperCase()}</span></span>
                )}
                {fund.score != null && (
                  <span>AG1 Score: <span className="text-accent-cyan font-bold">{fund.score}</span></span>
                )}
                {fund.confidence && <span>Confidence: {fund.confidence}</span>}
              </div>
              {fund.key_findings && fund.key_findings.length > 0 && (
                <div>
                  <div className="text-text-muted dark:text-dark-text-muted text-xs mb-1">Key Findings</div>
                  <ul className="text-xs text-text-secondary dark:text-dark-text-secondary space-y-0.5">
                    {fund.key_findings.map((f, i) => <li key={i}>- {f}</li>)}
                  </ul>
                </div>
              )}
              {fund.positive_signals && fund.positive_signals.length > 0 && (
                <div>
                  <div className="text-accent-green text-xs mb-1">Positive Signals</div>
                  <ul className="text-xs text-text-secondary dark:text-dark-text-secondary space-y-0.5">
                    {fund.positive_signals.map((s, i) => <li key={i}>- {s}</li>)}
                  </ul>
                </div>
              )}
              {fund.red_flags && fund.red_flags.length > 0 && (
                <div>
                  <div className="text-accent-red text-xs mb-1">Red Flags</div>
                  <ul className="text-xs text-text-secondary dark:text-dark-text-secondary space-y-0.5">
                    {fund.red_flags.map((f, i) => <li key={i}>- {f}</li>)}
                  </ul>
                </div>
              )}
              {fund.reasoning && (
                <div className="text-xs text-text-secondary dark:text-dark-text-secondary border-t border-border dark:border-dark-border pt-2">{fund.reasoning}</div>
              )}
            </>
          )}

          {activeTab === 'Governance' && gov && (
            <>
              <div className="flex flex-wrap gap-4 text-xs text-text-secondary dark:text-dark-text-secondary">
                {gov.governance_quality && (
                  <span>Quality: <span className={qualityColor(gov.governance_quality)}>{gov.governance_quality.toUpperCase()}</span></span>
                )}
                {gov.promoter_assessment && (
                  <span>Promoter: <span className={qualityColor(gov.promoter_assessment)}>{gov.promoter_assessment.toUpperCase()}</span></span>
                )}
                {gov.institutional_signal && (
                  <span>Institutional: <span className={
                    gov.institutional_signal === 'accumulating' ? 'text-accent-green' :
                    gov.institutional_signal === 'stable' ? 'text-accent-cyan' :
                    gov.institutional_signal === 'exiting' ? 'text-accent-red' :
                    'text-accent-amber'
                  }>{gov.institutional_signal.toUpperCase()}</span></span>
                )}
                {gov.adjustment != null && (
                  <span>Adjustment: <span className={gov.adjustment > 0 ? 'text-accent-green' : gov.adjustment < 0 ? 'text-accent-red' : 'text-text-muted dark:text-dark-text-muted'}>
                    {gov.adjustment > 0 ? '+' : ''}{gov.adjustment}
                  </span></span>
                )}
              </div>
              {gov.key_findings && gov.key_findings.length > 0 && (
                <div>
                  <div className="text-text-muted dark:text-dark-text-muted text-xs mb-1">Key Findings</div>
                  <ul className="text-xs text-text-secondary dark:text-dark-text-secondary space-y-0.5">
                    {gov.key_findings.map((f, i) => <li key={i}>- {f}</li>)}
                  </ul>
                </div>
              )}
              {gov.governance_risks && gov.governance_risks.length > 0 && (
                <div>
                  <div className="text-accent-red text-xs mb-1">Governance Risks</div>
                  <ul className="text-xs text-text-secondary dark:text-dark-text-secondary space-y-0.5">
                    {gov.governance_risks.map((r, i) => <li key={i}>- {r}</li>)}
                  </ul>
                </div>
              )}
              {gov.reasoning && (
                <div className="text-xs text-text-secondary dark:text-dark-text-secondary border-t border-border dark:border-dark-border pt-2">{gov.reasoning}</div>
              )}
            </>
          )}

          {activeTab === 'Risk' && rsk && (
            <>
              <div className="flex flex-wrap gap-4 text-xs text-text-secondary dark:text-dark-text-secondary">
                {rsk.overall_risk && (
                  <span>Overall Risk: <span className={riskColor(rsk.overall_risk)}>{rsk.overall_risk.toUpperCase()}</span></span>
                )}
                {rsk.adjustment != null && (
                  <span>Adjustment: <span className={rsk.adjustment > 0 ? 'text-accent-green' : rsk.adjustment < 0 ? 'text-accent-red' : 'text-text-muted dark:text-dark-text-muted'}>
                    {rsk.adjustment > 0 ? '+' : ''}{rsk.adjustment}
                  </span></span>
                )}
                {rsk.confidence && <span>Confidence: {rsk.confidence}</span>}
              </div>
              {rsk.primary_risks && rsk.primary_risks.length > 0 && (
                <div>
                  <div className="text-accent-red text-xs mb-1">Primary Risks</div>
                  <div className="space-y-1">
                    {rsk.primary_risks.map((r, i) => (
                      <div key={i} className="text-xs text-text-secondary dark:text-dark-text-secondary">
                        <span className={riskColor(r.severity)}>[{r.severity.toUpperCase()}]</span> {r.risk}
                        {r.evidence && <span className="text-text-muted dark:text-dark-text-muted"> — {r.evidence}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {rsk.risk_mitigants && rsk.risk_mitigants.length > 0 && (
                <div>
                  <div className="text-accent-green text-xs mb-1">Risk Mitigants</div>
                  <ul className="text-xs text-text-secondary dark:text-dark-text-secondary space-y-0.5">
                    {rsk.risk_mitigants.map((m, i) => <li key={i}>- {m}</li>)}
                  </ul>
                </div>
              )}
              {rsk.tail_risk && (
                <div>
                  <div className="text-accent-amber text-xs mb-1">Tail Risk</div>
                  <div className="text-xs text-text-secondary dark:text-dark-text-secondary">{rsk.tail_risk}</div>
                </div>
              )}
              {rsk.reasoning && (
                <div className="text-xs text-text-secondary dark:text-dark-text-secondary border-t border-border dark:border-dark-border pt-2">{rsk.reasoning}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
