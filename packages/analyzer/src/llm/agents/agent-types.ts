/**
 * Shared types for the multi-agent LLM layer.
 */

export interface FundamentalsAgentOutput {
  trend_assessment: 'improving' | 'stable' | 'deteriorating';
  earnings_quality: 'high' | 'medium' | 'low';
  earnings_quality_evidence: string;
  growth_sustainability: 'high' | 'medium' | 'low' | 'not_applicable';
  key_findings: string[];
  buffett_assessment: string;
  category_assessment: string;
  red_flags: string[];
  positive_signals: string[];
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface GovernanceAgentOutput {
  governance_quality: 'strong' | 'adequate' | 'weak' | 'red_flag';
  promoter_assessment: 'aligned' | 'neutral' | 'concerning' | 'predatory';
  promoter_evidence: string;
  institutional_signal: 'accumulating' | 'stable' | 'exiting' | 'mixed';
  institutional_evidence: string;
  key_findings: string[];
  governance_risks: string[];
  positive_signals: string[];
  adjustment: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface RiskFactor {
  risk: string;
  severity: 'high' | 'medium' | 'low';
  likelihood: 'high' | 'medium' | 'low';
  evidence: string;
}

export interface RiskAgentOutput {
  overall_risk: 'low' | 'moderate' | 'elevated' | 'high' | 'extreme';
  primary_risks: RiskFactor[];
  risk_mitigants: string[];
  tail_risk: string;
  key_findings: string[];
  adjustment: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface SynthesisAgentOutput {
  investment_thesis: string;
  signal_alignment: 'aligned' | 'mixed' | 'conflicting';
  signal_alignment_detail: string;
  score: number;
  recommended_classification: 'strong_long' | 'potential_long' | 'neutral' | 'potential_short' | 'strong_avoid';
  classification_reasoning: string;
  conviction: 'high' | 'medium' | 'low' | 'none';
  conviction_reasoning: string;
  time_horizon: '6m' | '1y' | '2y' | '5y';
  key_monitor_items: string[];
  category_verdict: string;
  key_findings: string[];
}

export type AgentTier = 'tier1' | 'tier2' | 'none';

export interface AgentRunResult {
  fundamentals?: FundamentalsAgentOutput;
  governance?: GovernanceAgentOutput;
  risk?: RiskAgentOutput;
  synthesis?: SynthesisAgentOutput;
  tier: AgentTier;
}
