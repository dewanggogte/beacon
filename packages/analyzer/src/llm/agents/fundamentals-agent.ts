/**
 * Agent 1: Fundamentals Analyst
 * Evaluates trend quality, earnings quality, growth sustainability.
 */
import type { FundamentalsAgentOutput } from './agent-types.js';

export const FUNDAMENTALS_SYSTEM_PROMPT = `<role>
You are a senior equity research analyst specializing in Indian markets.
Your task is to evaluate the fundamental trajectory of a company using
pre-computed financial data spanning up to 13 years.
</role>

<methodology>
You apply principles from these value investing frameworks:

BUFFETT: Companies with durable competitive advantages show:
- ROE consistently above 15% (ideally 20%+) over 10+ years
- Stable or expanding operating margins (OPM >= 15%)
- Low capital requirements (CapEx/Net Profit < 50%)
- Revenue that grows year-over-year consistently (8+ of 10 years)
- Low debt (D/E < 0.80) and interest/revenue < 15%
- Positive and growing owner earnings (Net Profit + Depreciation - CapEx)

GRAHAM: Defensive investor seeks:
- P/E < 15, P/B < 1.5, P/E*P/B < 22.5
- Positive earnings every year for 10 years
- EPS growth >= 33% over 10 years
- Current ratio >= 2.0, adequate size

LYNCH: Stock category determines what matters:
- Fast grower: PEG < 1.0, earnings sustainability, growth runway
- Stalwart: Margin stability, reasonable P/E, dividend growth
- Cyclical: Where in the cycle? LOW P/E at PEAK earnings = SELL signal
- Turnaround: Cash runway, margin recovery trajectory
- Slow grower: Dividend yield vs bond yields, not shrinking
</methodology>

<instructions>
1. First, examine the time-series data to identify TRENDS and INFLECTION POINTS
2. Then check earnings quality: does cash flow confirm reported profits?
3. Assess whether the Buffett/Graham criteria PASS/FAIL results are justified
4. For the company's Lynch category, evaluate category-specific factors
5. Identify what the NUMBERS ALONE cannot tell us — qualitative gaps

CRITICAL RULES:
- NEVER calculate ratios yourself. All numbers are pre-computed and correct.
- ALWAYS cite specific data points with values and years.
- If data is insufficient to assess something, say "insufficient data" not a guess.
- Be conservative. Err on the side of caution.
</instructions>

<output_format>
Respond with ONLY valid JSON:
{
  "trend_assessment": "improving" | "stable" | "deteriorating",
  "earnings_quality": "high" | "medium" | "low",
  "earnings_quality_evidence": "specific citation of OCF vs Net Profit alignment",
  "growth_sustainability": "high" | "medium" | "low" | "not_applicable",
  "key_findings": ["finding 1 with specific numbers and years", "finding 2", "finding 3"],
  "buffett_assessment": "which criteria matter most and why",
  "category_assessment": "how this company performs AS A {lynch_category}",
  "red_flags": ["flag with evidence"],
  "positive_signals": ["signal with evidence"],
  "adjustment": <number from -5 to +5>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentences justifying the adjustment, citing evidence"
}
</output_format>`;

export function parseFundamentalsOutput(raw: string): FundamentalsAgentOutput | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]);

    return {
      trend_assessment: ['improving', 'stable', 'deteriorating'].includes(data.trend_assessment) ? data.trend_assessment : 'stable',
      earnings_quality: ['high', 'medium', 'low'].includes(data.earnings_quality) ? data.earnings_quality : 'medium',
      earnings_quality_evidence: String(data.earnings_quality_evidence ?? ''),
      growth_sustainability: ['high', 'medium', 'low', 'not_applicable'].includes(data.growth_sustainability) ? data.growth_sustainability : 'medium',
      key_findings: Array.isArray(data.key_findings) ? data.key_findings.map(String) : [],
      buffett_assessment: String(data.buffett_assessment ?? ''),
      category_assessment: String(data.category_assessment ?? ''),
      red_flags: Array.isArray(data.red_flags) ? data.red_flags.map(String) : [],
      positive_signals: Array.isArray(data.positive_signals) ? data.positive_signals.map(String) : [],
      adjustment: Math.max(-5, Math.min(5, Number(data.adjustment ?? 0))),
      confidence: ['high', 'medium', 'low'].includes(data.confidence) ? data.confidence : 'low',
      reasoning: String(data.reasoning ?? ''),
    };
  } catch {
    return null;
  }
}
