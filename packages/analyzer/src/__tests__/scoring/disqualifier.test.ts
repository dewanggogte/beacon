import { describe, it, expect } from 'vitest';
import { checkDisqualifiers } from '../../scoring/disqualifier.js';
import { checkHardGates } from '../../scoring/hard-gates.js';

// ---------------------------------------------------------------------------
// Helpers — minimal fixture builders
// ---------------------------------------------------------------------------

function makeEnriched(overrides: Record<string, unknown> = {}) {
  return {
    netProfitHistory: [100, 100, 100, 100, 100],
    promoterHolding4qChange: 0,
    piotroskiFScore: 6,
    altmanZScore: 3.0,
    roceTrailing3Y: 15,
    revenueDeclineYears: 0,
    beneishMScore: -2.5,
    ocfToNetProfitAvg3Y: 0.8,
    ocfHistory: [80, 70, 60],
    promoterPledgePct: null,
    dataCompletenessScore: 8,
    otherIncomeToProfit: null,
    sector: 'IT',
    ...overrides,
  } as any;
}

// =========================================================================
// Part 1: Basic Disqualifiers — checkDisqualifiers(snapshot, rules)
// =========================================================================

describe('checkDisqualifiers — basic rules', () => {
  it('disqualifies when promoter pledge > 50%', () => {
    const snapshot = { promoterPledge: 60 };
    const { reasons } = checkDisqualifiers(snapshot, ['Promoter pledge > 50%']);
    expect(reasons).toContain('Promoter pledge > 50%');
  });

  it('does NOT disqualify when promoter pledge <= 50%', () => {
    const snapshot = { promoterPledge: 30 };
    const { reasons } = checkDisqualifiers(snapshot, ['Promoter pledge > 50%']);
    expect(reasons).toHaveLength(0);
  });

  it('does NOT disqualify when promoter pledge is null', () => {
    const snapshot = { promoterPledge: null };
    const { reasons } = checkDisqualifiers(snapshot, ['Promoter pledge > 50%']);
    expect(reasons).toHaveLength(0);
  });

  it('disqualifies on negative net worth (bookValue < 0)', () => {
    const snapshot = { bookValue: -5 };
    const { reasons } = checkDisqualifiers(snapshot, ['Negative net worth']);
    expect(reasons).toContain('Negative net worth');
  });

  it('does NOT disqualify on positive net worth', () => {
    const snapshot = { bookValue: 100 };
    const { reasons } = checkDisqualifiers(snapshot, ['Negative net worth']);
    expect(reasons).toHaveLength(0);
  });

  it('disqualifies when ASM/GSM listed', () => {
    const snapshot = { asmGsmListed: true };
    const { reasons } = checkDisqualifiers(snapshot, ['ASM or GSM listed']);
    expect(reasons).toContain('ASM or GSM listed');
  });

  it('does NOT disqualify when ASM/GSM is false', () => {
    const snapshot = { asmGsmListed: false };
    const { reasons } = checkDisqualifiers(snapshot, ['ASM or GSM listed']);
    expect(reasons).toHaveLength(0);
  });

  it('disqualifies on qualified audit opinion', () => {
    const snapshot = { qualifiedAuditOpinion: true };
    const { reasons } = checkDisqualifiers(snapshot, ['Qualified audit opinion']);
    expect(reasons).toContain('Qualified audit opinion');
  });

  it('does NOT disqualify when audit opinion is clean', () => {
    const snapshot = { qualifiedAuditOpinion: false };
    const { reasons } = checkDisqualifiers(snapshot, ['Qualified audit opinion']);
    expect(reasons).toHaveLength(0);
  });

  it('disqualifies on negative cash flow for 3+ consecutive years', () => {
    const snapshot = {
      cashFlow: [
        { 'Cash from Operating Activity': -10 },
        { 'Cash from Operating Activity': -20 },
        { 'Cash from Operating Activity': -30 },
      ],
    };
    const { reasons } = checkDisqualifiers(snapshot, [
      'Negative operating cash flow for 3+ consecutive years',
    ]);
    expect(reasons).toContain('Negative operating cash flow for 3+ consecutive years');
  });

  it('does NOT disqualify when cash flow is positive in any of 3 years', () => {
    const snapshot = {
      cashFlow: [
        { 'Cash from Operating Activity': 10 },
        { 'Cash from Operating Activity': -20 },
        { 'Cash from Operating Activity': -30 },
      ],
    };
    const { reasons } = checkDisqualifiers(snapshot, [
      'Negative operating cash flow for 3+ consecutive years',
    ]);
    expect(reasons).toHaveLength(0);
  });

  it('does NOT disqualify when cashFlow array has < 3 entries', () => {
    const snapshot = {
      cashFlow: [{ 'Cash from Operating Activity': -10 }],
    };
    const { reasons } = checkDisqualifiers(snapshot, [
      'Negative operating cash flow for 3+ consecutive years',
    ]);
    expect(reasons).toHaveLength(0);
  });

  it('disqualifies on debt/equity > 3 for non-banking sector', () => {
    const snapshot = { debtToEquity: 4.5, sector: 'IT' };
    const { reasons } = checkDisqualifiers(snapshot, ['Debt to equity > 3']);
    expect(reasons).toContain('Debt to equity > 3');
  });

  it('skips debt/equity check for banking sector', () => {
    const snapshot = { debtToEquity: 10, sector: 'Banking' };
    const { reasons } = checkDisqualifiers(snapshot, ['Debt to equity > 3']);
    expect(reasons).toHaveLength(0);
  });

  it('skips debt/equity check for NBFC sector', () => {
    const snapshot = { debtToEquity: 10, sector: 'NBFC' };
    const { reasons } = checkDisqualifiers(snapshot, ['Debt to equity > 3']);
    expect(reasons).toHaveLength(0);
  });

  it('does NOT skip debt/equity for "Financial Services" (inlined check uses "finance" not "financial")', () => {
    // NOTE: This is a known inconsistency — hard-gates.ts isBankingOrNBFC()
    // uses 'financial' (matches), but disqualifier.ts uses 'finance' (doesn't
    // match "financial services"). The hard gates correctly skip for this sector.
    const snapshot = { debtToEquity: 10, sector: 'Financial Services' };
    const { reasons } = checkDisqualifiers(snapshot, ['Debt to equity > 3']);
    expect(reasons).toContain('Debt to equity > 3');
  });

  it('handles fallback generic rule "someField > 100"', () => {
    const snapshot = { someField: 150 };
    const { reasons } = checkDisqualifiers(snapshot, ['someField > 100']);
    expect(reasons).toContain('someField > 100');
  });

  it('generic rule does NOT trigger below threshold', () => {
    const snapshot = { someField: 50 };
    const { reasons } = checkDisqualifiers(snapshot, ['someField > 100']);
    expect(reasons).toHaveLength(0);
  });

  it('generic rule handles < operator', () => {
    const snapshot = { someField: 5 };
    const { reasons } = checkDisqualifiers(snapshot, ['someField < 10']);
    expect(reasons).toContain('someField < 10');
  });

  it('returns false for unknown rule', () => {
    const snapshot = { anything: 123 };
    const { reasons } = checkDisqualifiers(snapshot, ['totally unknown rule xyz']);
    expect(reasons).toHaveLength(0);
  });

  it('returns empty reasons for empty rules array', () => {
    const snapshot = { promoterPledge: 99, bookValue: -100 };
    const { reasons } = checkDisqualifiers(snapshot, []);
    expect(reasons).toHaveLength(0);
  });
});

// =========================================================================
// Part 2: Enriched-Path Disqualifiers
// =========================================================================

describe('checkDisqualifiers — enriched data path', () => {
  it('disqualifies on net losses in 3+ of 5 years', () => {
    const enriched = makeEnriched({
      netProfitHistory: [-10, -20, -30, 50, 60],
    });
    const { reasons } = checkDisqualifiers({}, [], enriched);
    expect(reasons.some((r) => r.includes('Net losses in 3 of last 5 years'))).toBe(true);
  });

  it('does NOT disqualify on net losses in fewer than 3 of 5 years', () => {
    const enriched = makeEnriched({
      netProfitHistory: [-10, -20, 30, 50, 60],
    });
    const { reasons } = checkDisqualifiers({}, [], enriched);
    expect(reasons.some((r) => r.includes('Net losses'))).toBe(false);
  });

  it('does NOT disqualify when profit history has < 5 valid entries', () => {
    const enriched = makeEnriched({
      netProfitHistory: [-10, -20, -30, null, null],
    });
    const { reasons } = checkDisqualifiers({}, [], enriched);
    // Only 3 valid entries, needs >= 5
    expect(reasons.some((r) => r.includes('Net losses'))).toBe(false);
  });

  it('disqualifies on promoter holding decline > 10pp', () => {
    const enriched = makeEnriched({
      promoterHolding4qChange: -15,
    });
    const { reasons } = checkDisqualifiers({}, [], enriched);
    expect(reasons.some((r) => r.includes('Promoter holding declined'))).toBe(true);
    expect(reasons.some((r) => r.includes('15.0pp'))).toBe(true);
  });

  it('does NOT disqualify when promoter holding decline is <= 10pp', () => {
    const enriched = makeEnriched({
      promoterHolding4qChange: -5,
    });
    const { reasons } = checkDisqualifiers({}, [], enriched);
    expect(reasons.some((r) => r.includes('Promoter holding declined'))).toBe(false);
  });

  it('does NOT disqualify when promoter holding change is null', () => {
    const enriched = makeEnriched({
      promoterHolding4qChange: null,
    });
    const { reasons } = checkDisqualifiers({}, [], enriched);
    expect(reasons.some((r) => r.includes('Promoter holding declined'))).toBe(false);
  });
});

// =========================================================================
// Part 3: Hard Gates — checkHardGates(enrichedData)
// =========================================================================

describe('checkHardGates', () => {
  it('disqualifies on Piotroski F-Score <= 2', () => {
    const enriched = makeEnriched({ piotroskiFScore: 1 });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('Piotroski F-Score'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'piotroski_f_score')?.passed).toBe(false);
  });

  it('passes on Piotroski F-Score > 2', () => {
    const enriched = makeEnriched({ piotroskiFScore: 5 });
    const { gateResults } = checkHardGates(enriched);
    expect(gateResults.find((g) => g.gate === 'piotroski_f_score')?.passed).toBe(true);
  });

  it('disqualifies on Altman Z-Score < 1.8 for non-financial', () => {
    const enriched = makeEnriched({ altmanZScore: 1.2, sector: 'IT' });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('Altman Z-Score'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'altman_z_score')?.passed).toBe(false);
  });

  it('skips Altman Z-Score for banking sector', () => {
    const enriched = makeEnriched({ altmanZScore: 0.5, sector: 'Banking' });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('Altman Z-Score'))).toBe(false);
    expect(gateResults.find((g) => g.gate === 'altman_z_score')?.passed).toBe(true);
  });

  it('disqualifies on ROCE trailing 3Y < 6% for non-financial', () => {
    const enriched = makeEnriched({ roceTrailing3Y: 3.5, sector: 'Manufacturing' });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('ROCE trailing 3Y'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'roce_3y_floor')?.passed).toBe(false);
  });

  it('skips ROCE check for Financial Services sector', () => {
    const enriched = makeEnriched({ roceTrailing3Y: 2, sector: 'Financial Services' });
    const { gateResults } = checkHardGates(enriched);
    expect(gateResults.find((g) => g.gate === 'roce_3y_floor')?.passed).toBe(true);
  });

  it('disqualifies on revenue declining 4+ of 5 years', () => {
    const enriched = makeEnriched({ revenueDeclineYears: 4 });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('Revenue declined'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'revenue_decline')?.passed).toBe(false);
  });

  it('passes when revenue decline < 4 years', () => {
    const enriched = makeEnriched({ revenueDeclineYears: 2 });
    const { gateResults } = checkHardGates(enriched);
    expect(gateResults.find((g) => g.gate === 'revenue_decline')?.passed).toBe(true);
  });

  it('disqualifies on data completeness < 5/10', () => {
    const enriched = makeEnriched({ dataCompletenessScore: 3 });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('Data completeness'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'data_completeness')?.passed).toBe(false);
  });

  it('passes on data completeness >= 5/10', () => {
    const enriched = makeEnriched({ dataCompletenessScore: 7 });
    const { gateResults } = checkHardGates(enriched);
    expect(gateResults.find((g) => g.gate === 'data_completeness')?.passed).toBe(true);
  });

  it('disqualifies on Beneish M-Score > -1.78 (manipulation flag)', () => {
    const enriched = makeEnriched({ beneishMScore: -1.0 });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('Beneish M-Score'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'beneish_m_score')?.passed).toBe(false);
  });

  it('passes on Beneish M-Score <= -1.78', () => {
    const enriched = makeEnriched({ beneishMScore: -2.5 });
    const { gateResults } = checkHardGates(enriched);
    expect(gateResults.find((g) => g.gate === 'beneish_m_score')?.passed).toBe(true);
  });

  it('skips Beneish M-Score when null (insufficient data)', () => {
    const enriched = makeEnriched({ beneishMScore: null });
    const { gateResults } = checkHardGates(enriched);
    expect(gateResults.find((g) => g.gate === 'beneish_m_score')?.passed).toBe(true);
  });

  it('disqualifies on OCF/Profit chronic failure (3Y avg < 0.2)', () => {
    const enriched = makeEnriched({
      ocfToNetProfitAvg3Y: 0.1,
      ocfHistory: [10, 10, 10],
      netProfitHistory: [100, 100, 100, 100, 100],
    });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('OCF/Profit ratio'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'ocf_profit_ratio')?.passed).toBe(false);
  });

  it('disqualifies on OCF/Profit acute failure (latest < 0.1)', () => {
    const enriched = makeEnriched({
      ocfToNetProfitAvg3Y: 0.5,
      ocfHistory: [5, 70, 60],
      netProfitHistory: [100, 100, 100, 100, 100],
    });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('OCF/Profit ratio'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'ocf_profit_ratio')?.passed).toBe(false);
  });

  it('passes OCF/Profit when healthy ratios', () => {
    const enriched = makeEnriched({
      ocfToNetProfitAvg3Y: 0.8,
      ocfHistory: [80, 70, 60],
      netProfitHistory: [100, 100, 100, 100, 100],
    });
    const { gateResults } = checkHardGates(enriched);
    expect(gateResults.find((g) => g.gate === 'ocf_profit_ratio')?.passed).toBe(true);
  });

  it('disqualifies on promoter pledge > 50% (from enriched text)', () => {
    const enriched = makeEnriched({ promoterPledgePct: 65 });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('Promoter pledge'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'promoter_pledge_text')?.passed).toBe(false);
  });

  it('passes promoter pledge when <= 50%', () => {
    const enriched = makeEnriched({ promoterPledgePct: 30 });
    const { gateResults } = checkHardGates(enriched);
    expect(gateResults.find((g) => g.gate === 'promoter_pledge_text')?.passed).toBe(true);
  });

  it('disqualifies on other income > 60% of profit', () => {
    const enriched = makeEnriched({ otherIncomeToProfit: 0.75 });
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons.some((r) => r.includes('Other income'))).toBe(true);
    expect(gateResults.find((g) => g.gate === 'other_income_excess')?.passed).toBe(false);
  });

  it('passes other income when <= 60%', () => {
    const enriched = makeEnriched({ otherIncomeToProfit: 0.3 });
    const { gateResults } = checkHardGates(enriched);
    expect(gateResults.find((g) => g.gate === 'other_income_excess')?.passed).toBe(true);
  });

  it('returns all gate results even when all pass', () => {
    const enriched = makeEnriched();
    const { reasons, gateResults } = checkHardGates(enriched);
    expect(reasons).toHaveLength(0);
    // Should have all 9 gates tracked
    expect(gateResults.length).toBeGreaterThanOrEqual(9);
  });
});

// =========================================================================
// Part 4: Edge Cases & isBankingOrNBFC
// =========================================================================

describe('edge cases', () => {
  it('null/undefined field values do not trigger disqualification', () => {
    const snapshot = {
      promoterPledge: undefined,
      bookValue: null,
      debtToEquity: undefined,
    };
    const rules = [
      'Promoter pledge > 50%',
      'Negative net worth',
      'Debt to equity > 3',
    ];
    const { reasons } = checkDisqualifiers(snapshot, rules);
    expect(reasons).toHaveLength(0);
  });

  it('multiple rules can trigger simultaneously', () => {
    const snapshot = {
      promoterPledge: 70,
      bookValue: -50,
      asmGsmListed: true,
    };
    const rules = [
      'Promoter pledge > 50%',
      'Negative net worth',
      'ASM or GSM listed',
    ];
    const { reasons } = checkDisqualifiers(snapshot, rules);
    expect(reasons).toHaveLength(3);
  });

  it('isBankingOrNBFC is correctly applied via hard gates', () => {
    // Banking: Z-Score and ROCE gates should be skipped
    const bankEnriched = makeEnriched({
      sector: 'Banking',
      altmanZScore: 0.1,
      roceTrailing3Y: 1,
    });
    const { gateResults } = checkHardGates(bankEnriched);
    expect(gateResults.find((g) => g.gate === 'altman_z_score')?.passed).toBe(true);
    expect(gateResults.find((g) => g.gate === 'roce_3y_floor')?.passed).toBe(true);
  });

  it('isBankingOrNBFC matches NBFC sector', () => {
    const nbfcEnriched = makeEnriched({
      sector: 'NBFC',
      altmanZScore: 0.1,
    });
    const { gateResults } = checkHardGates(nbfcEnriched);
    expect(gateResults.find((g) => g.gate === 'altman_z_score')?.passed).toBe(true);
  });

  it('isBankingOrNBFC matches Financial Services', () => {
    const finEnriched = makeEnriched({
      sector: 'Financial Services',
      altmanZScore: 0.1,
    });
    const { gateResults } = checkHardGates(finEnriched);
    expect(gateResults.find((g) => g.gate === 'altman_z_score')?.passed).toBe(true);
  });

  it('enriched path returns gateResults alongside reasons', () => {
    const enriched = makeEnriched({ piotroskiFScore: 1 });
    const { reasons, gateResults } = checkDisqualifiers({}, [], enriched);
    expect(gateResults).toBeDefined();
    expect(gateResults!.length).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes('Piotroski'))).toBe(true);
  });
});
