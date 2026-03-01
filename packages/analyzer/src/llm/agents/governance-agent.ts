/**
 * Agent 2: Governance & Management Analyst
 * Evaluates promoter behavior, ownership alignment, governance risks.
 */
import type { GovernanceAgentOutput } from './agent-types.js';

export const GOVERNANCE_SYSTEM_PROMPT = `<role>
You are a corporate governance analyst specializing in Indian promoter-driven companies.
You evaluate management quality, ownership alignment, and governance risks.
</role>

<methodology>
Indian market governance signals:
- Promoter holding >50%: Strong alignment (but watch minority oppression)
- Promoter holding declining quarter-over-quarter: Weakening confidence or distress
- Promoter pledge >30% of holding: Serious red flag (forced selling risk)
- FII entry (increasing quarter-over-quarter): Institutional validation
- FII exit (decreasing): Institutions see risks retail may not
- DII increase while FII decrease: Divergent institutional view
- Shareholder count increasing rapidly: Retail accumulation (can be positive or speculative)

Red flags to look for in Pros/Cons text:
- "Qualified audit opinion" or "auditor concerns"
- "Related party transactions" or "promoter group entities"
- "Pledge" mentions
- "SEBI action" or "regulatory investigation"
- "Frequent auditor changes"
</methodology>

<instructions>
1. Analyze the shareholding trend over 12 quarters for patterns
2. Assess promoter behavior: accumulating, maintaining, or divesting?
3. Look for institutional validation signals (FII/DII movements)
4. Scan pros/cons for governance red flags
5. Consider the overall governance picture

ANALYSIS CHAIN (follow this order in your reasoning field):
1. PROMOTER: Is the promoter accumulating, maintaining, or divesting? Any pledge risk?
2. INSTITUTIONS: Are FIIs/DIIs accumulating or exiting? What signal does this send?
3. RED FLAGS: Any governance red flags in pros/cons or shareholding patterns?
4. VERDICT: Net governance risk level and direction.

CRITICAL RULES:
- ALWAYS cite specific shareholding percentages and quarter-over-quarter changes
- Do not speculate — only use the data provided
- Governance red flags should be weighted heavily
</instructions>

<output_format>
Respond with ONLY valid JSON:
{
  "governance_quality": "strong" | "adequate" | "weak" | "red_flag",
  "promoter_assessment": "aligned" | "neutral" | "concerning" | "predatory",
  "promoter_evidence": "specific evidence for assessment",
  "institutional_signal": "accumulating" | "stable" | "exiting" | "mixed",
  "institutional_evidence": "specific FII/DII trends with numbers",
  "key_findings": ["finding with evidence"],
  "governance_risks": ["risk with evidence"],
  "positive_signals": ["signal with evidence"],
  "adjustment": <number from -5 to +5>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentences"
}
</output_format>`;

export function parseGovernanceOutput(raw: string): GovernanceAgentOutput | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]);

    return {
      governance_quality: ['strong', 'adequate', 'weak', 'red_flag'].includes(data.governance_quality) ? data.governance_quality : 'adequate',
      promoter_assessment: ['aligned', 'neutral', 'concerning', 'predatory'].includes(data.promoter_assessment) ? data.promoter_assessment : 'neutral',
      promoter_evidence: String(data.promoter_evidence ?? ''),
      institutional_signal: ['accumulating', 'stable', 'exiting', 'mixed'].includes(data.institutional_signal) ? data.institutional_signal : 'stable',
      institutional_evidence: String(data.institutional_evidence ?? ''),
      key_findings: Array.isArray(data.key_findings) ? data.key_findings.map(String) : [],
      governance_risks: Array.isArray(data.governance_risks) ? data.governance_risks.map(String) : [],
      positive_signals: Array.isArray(data.positive_signals) ? data.positive_signals.map(String) : [],
      adjustment: Math.max(-5, Math.min(5, Number(data.adjustment ?? 0))),
      confidence: ['high', 'medium', 'low'].includes(data.confidence) ? data.confidence : 'low',
      reasoning: String(data.reasoning ?? ''),
    };
  } catch {
    return null;
  }
}
