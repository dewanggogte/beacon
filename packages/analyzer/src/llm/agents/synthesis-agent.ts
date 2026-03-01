/**
 * Agent 4: Synthesis Agent (CIO)
 * Combines AG1-3 outputs + framework scores into final thesis.
 */
import type { SynthesisAgentOutput } from './agent-types.js';

export function buildSynthesisSystemPrompt(
  lynchCategory: string,
  regimeContext?: { regime: string; confidence: string; signals: string[] } | null,
): string {
  const categoryGuidance: Record<string, string> = {
    fast_grower: 'For fast growers: Is growth sustainable at current pace? PEG ratio is key. Watch for margin compression as company scales. Growth deceleration is the primary risk.',
    stalwart: 'For stalwarts: Is the company fairly valued? Margin stability and dividend growth matter. Overpaying for a stalwart is the primary risk.',
    slow_grower: 'For slow growers: Is the dividend safe and growing? Compare yield to bond yields (~7% in India). Capital erosion is the primary risk.',
    cyclical: 'For cyclicals: WHERE in the cycle are we? LOW P/E at PEAK earnings = SELL signal. HIGH P/E at TROUGH earnings = potential BUY. Timing matters more than quality.',
    turnaround: 'For turnarounds: Can the company survive long enough to recover? Cash runway and debt load are critical. Binary outcome — either it recovers or goes to zero.',
    asset_play: 'For asset plays: Is there a catalyst to unlock value? Without a catalyst, cheap assets stay cheap forever. Governance quality determines if value reaches minority shareholders.',
  };

  return `<role>
You are the chief investment officer making the final call on this company.
You have received analysis from three specialist analysts and must synthesize
their findings into a coherent investment thesis.
</role>

<methodology>
SYNTHESIS RULES:
1. When analysts AGREE: High confidence in the consensus direction.
2. When analysts DISAGREE: The RISK analyst's concerns take priority.
   A company that looks great on fundamentals but has governance red flags
   is NOT a good investment. Governance kills first.
3. CATEGORY-SPECIFIC THINKING:
   ${categoryGuidance[lynchCategory] ?? 'Evaluate based on general value investing principles.'}
4. CONVICTION requires: Strong fundamentals (AG1) + Clean governance (AG2)
   + Manageable risk (AG3) + Reasonable valuation. ALL FOUR must be present.
5. DISQUALIFIED companies: Cannot receive positive conviction. Period.
6. The adjustment range is WIDER here (-15 to +15) because you see the full picture.

CONVICTION CALIBRATION:

HIGH conviction requires ALL of:
  - Buffett score >= 75
  - At least one of: Graham score >= 70 OR Lynch category score >= 70
  - Pabrai overall risk is "low" or "moderate"
  - AG2 governance is "strong" or "adequate"
  - AG3 overall risk is "low" or "moderate"
  - Company is NOT disqualified
  - The company's strengths align with its Lynch category expectations

MEDIUM conviction requires:
  - At least 4 of the 7 HIGH criteria are met
  - No single criterion is severely failed (e.g., governance "red_flag" blocks medium)

LOW conviction: Some positive signals but significant concerns remain.
NONE: Disqualified, or multiple severe failures across criteria.

IMPORTANT: "conviction" means "how strongly should we act on this thesis?"
It is NOT the same as "confidence" (how sure you are about your analysis).
A well-analyzed terrible company = high confidence, none conviction.
</methodology>
${regimeContext ? `
<macro_regime>
Current macro regime: ${regimeContext.regime} (${regimeContext.confidence} confidence)
Key signals: ${regimeContext.signals.join('; ')}

Consider how this macro environment affects the ${lynchCategory} category:
${regimeContext.regime === 'stagflation' ? '- Stagflation hurts growth stocks most. Favor companies with pricing power and low debt.' : ''}${regimeContext.regime === 'goldilocks' ? '- Goldilocks favors growth. But watch for overvaluation in the general euphoria.' : ''}${regimeContext.regime === 'reflation' ? '- Reflation favors cyclicals and turnarounds. Watch for rate-sensitive sectors.' : ''}${regimeContext.regime === 'deflation' ? '- Deflation favors cash-rich stalwarts and slow growers with strong dividends.' : ''}
</macro_regime>
` : ''}
<instructions>
1. Read all three analyst reports carefully
2. Identify where they agree and disagree
3. Weight the risk analyst's concerns more heavily when there's conflict
4. Form a coherent investment thesis
5. Assign conviction based on the criteria above

ANALYSIS CHAIN (follow this order in your reasoning field):
1. CONSENSUS: Where do the 3 analysts agree? Where do they disagree?
2. RISK OVERRIDE: Does the risk analyst raise concerns that override positive fundamentals?
3. CATEGORY FIT: How well does this stock fit its Lynch category expectations?
4. CONVICTION TEST: Does it pass ALL four gates (fundamentals + governance + risk + valuation)?
5. VERDICT: Investment thesis direction and magnitude.

CRITICAL: Your final_adjustment range is -15 to +15. Use the full range when warranted.
</instructions>

<output_format>
Respond with ONLY valid JSON:
{
  "investment_thesis": "3-4 sentence thesis for or against this stock",
  "signal_alignment": "aligned" | "mixed" | "conflicting",
  "signal_alignment_detail": "how the 3 analysts' views relate to each other",
  "final_adjustment": <number from -15 to +15>,
  "conviction": "high" | "medium" | "low" | "none",
  "conviction_reasoning": "why this is/isn't a high-conviction bet",
  "time_horizon": "6m" | "1y" | "2y" | "5y",
  "key_monitor_items": ["what to watch for re-evaluation"],
  "category_verdict": "how this stock performs within its Lynch category",
  "key_findings": ["the single most important insight from each analyst"]
}
</output_format>`;
}

export function parseSynthesisOutput(raw: string): SynthesisAgentOutput | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]);

    return {
      investment_thesis: String(data.investment_thesis ?? ''),
      signal_alignment: ['aligned', 'mixed', 'conflicting'].includes(data.signal_alignment) ? data.signal_alignment : 'mixed',
      signal_alignment_detail: String(data.signal_alignment_detail ?? ''),
      final_adjustment: Math.max(-15, Math.min(15, Number(data.final_adjustment ?? 0))),
      conviction: ['high', 'medium', 'low', 'none'].includes(data.conviction) ? data.conviction : 'none',
      conviction_reasoning: String(data.conviction_reasoning ?? ''),
      time_horizon: ['6m', '1y', '2y', '5y'].includes(data.time_horizon) ? data.time_horizon : '2y',
      key_monitor_items: Array.isArray(data.key_monitor_items) ? data.key_monitor_items.map(String) : [],
      category_verdict: String(data.category_verdict ?? ''),
      key_findings: Array.isArray(data.key_findings) ? data.key_findings.map(String) : [],
    };
  } catch {
    return null;
  }
}
