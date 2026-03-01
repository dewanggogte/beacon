/**
 * Compare Local Qwen 3.5 vs Anthropic Haiku/Sonnet on the full 4-agent pipeline.
 *
 * Runs AG1-AG4 for N companies through both providers, then produces a
 * thorough side-by-side analysis of: parse rates, timing, categorical
 * agreement, adjustment spread, and qualitative output quality.
 *
 * Usage: npx tsx scripts/compare-providers.ts [count=8]
 *
 * Requires:
 *   - ANTHROPIC_API_KEY set (for Haiku/Sonnet)
 *   - Local LLM running at LOCAL_LLM_URL (for Qwen)
 */
import { AnthropicClient } from '../packages/analyzer/src/llm/anthropic-client.js';
import { OpenAICompatibleClient } from '../packages/analyzer/src/llm/openai-compatible-client.js';
import { config } from '@screener/shared';
import { loadRubric } from '../packages/analyzer/src/scoring/rubric-loader.js';
import { scoreAllCompanies } from '../packages/analyzer/src/scoring/engine.js';
import {
  buildFundamentalsDataPack,
  buildGovernanceDataPack,
  buildRiskDataPack,
  buildSynthesisDataPack,
} from '../packages/analyzer/src/llm/agents/data-pack-builder.js';
import { FUNDAMENTALS_SYSTEM_PROMPT, parseFundamentalsOutput } from '../packages/analyzer/src/llm/agents/fundamentals-agent.js';
import { GOVERNANCE_SYSTEM_PROMPT, parseGovernanceOutput } from '../packages/analyzer/src/llm/agents/governance-agent.js';
import { RISK_SYSTEM_PROMPT, parseRiskOutput } from '../packages/analyzer/src/llm/agents/risk-agent.js';
import { buildSynthesisSystemPrompt, parseSynthesisOutput } from '../packages/analyzer/src/llm/agents/synthesis-agent.js';
import type {
  FundamentalsAgentOutput,
  GovernanceAgentOutput,
  RiskAgentOutput,
  SynthesisAgentOutput,
} from '../packages/analyzer/src/llm/agents/agent-types.js';
import type { CompanyAnalysis } from '@screener/shared';
import type { EnrichedSnapshot } from '../packages/analyzer/src/enrichment/flatten-v2.js';
import type { LlmClient } from '../packages/analyzer/src/llm/llm-client.js';

const count = parseInt(process.argv[2] ?? '8', 10);

// ── Types ──

interface AgentCall {
  agent: string;
  provider: string;
  company: string;
  timeSec: number;
  rawLen: number;
  parseSuccess: boolean;
  error: string | null;
}

interface CompanyResult {
  company: string;
  companyName: string;
  compositeScore: number;
  lynchCategory: string;
  provider: string;
  ag1: { call: AgentCall; parsed: FundamentalsAgentOutput | null; raw: string };
  ag2: { call: AgentCall; parsed: GovernanceAgentOutput | null; raw: string };
  ag3: { call: AgentCall; parsed: RiskAgentOutput | null; raw: string };
  ag4: { call: AgentCall; parsed: SynthesisAgentOutput | null; raw: string };
  totalTimeSec: number;
  allParsed: boolean;
}

// ── Helpers ──

async function runAgent<T>(
  client: LlmClient,
  systemPrompt: string,
  userMsg: string,
  parser: (raw: string) => T | null,
  agentName: string,
  provider: string,
  company: string,
  maxTokens: number,
): Promise<{ call: AgentCall; parsed: T | null; raw: string }> {
  const start = Date.now();
  try {
    const raw = await client.generate(systemPrompt, userMsg, {
      maxTokens,
      cacheSystemPrompt: true,
    });
    const elapsed = (Date.now() - start) / 1000;
    const parsed = parser(raw);
    return {
      call: {
        agent: agentName, provider, company,
        timeSec: elapsed, rawLen: raw.length,
        parseSuccess: parsed !== null, error: null,
      },
      parsed,
      raw,
    };
  } catch (err) {
    const elapsed = (Date.now() - start) / 1000;
    return {
      call: {
        agent: agentName, provider, company,
        timeSec: elapsed, rawLen: 0,
        parseSuccess: false, error: (err as Error).message,
      },
      parsed: null,
      raw: '',
    };
  }
}

async function runFullPipeline(
  client: LlmClient,
  provider: string,
  analysis: CompanyAnalysis,
  enriched: EnrichedSnapshot,
): Promise<CompanyResult> {
  const code = analysis.screenerCode;
  const fr = analysis.frameworkResults!;

  // Token limits: Anthropic produces more verbose output than Qwen (~1.5-2x).
  // AG1 and AG3 need 2048 to avoid truncation; AG2 is shorter, 1024 suffices.
  const agTokens = provider === 'anthropic' ? 2048 : 1024;

  // AG1
  const ag1 = await runAgent(
    client, FUNDAMENTALS_SYSTEM_PROMPT,
    buildFundamentalsDataPack(analysis, enriched, fr),
    parseFundamentalsOutput, 'AG1', provider, code, agTokens,
  );

  // AG2
  const ag2 = await runAgent(
    client, GOVERNANCE_SYSTEM_PROMPT,
    buildGovernanceDataPack(analysis, enriched, fr),
    parseGovernanceOutput, 'AG2', provider, code, 1024,
  );

  // AG3
  const ag3 = await runAgent(
    client, RISK_SYSTEM_PROMPT,
    buildRiskDataPack(analysis, enriched, fr),
    parseRiskOutput, 'AG3', provider, code, agTokens,
  );

  // AG4 — synthesis receives AG1-3 raw outputs
  const synthSys = buildSynthesisSystemPrompt(fr.lynch.category);
  const synthUser = buildSynthesisDataPack(analysis, enriched, fr, ag1.raw, ag2.raw, ag3.raw);
  const ag4 = await runAgent(
    client, synthSys, synthUser,
    parseSynthesisOutput, 'AG4', provider, code, provider === 'anthropic' ? 2048 : 1500,
  );

  const totalTimeSec = ag1.call.timeSec + ag2.call.timeSec + ag3.call.timeSec + ag4.call.timeSec;
  const allParsed = ag1.call.parseSuccess && ag2.call.parseSuccess && ag3.call.parseSuccess && ag4.call.parseSuccess;

  return {
    company: code,
    companyName: analysis.companyName,
    compositeScore: analysis.compositeScore,
    lynchCategory: fr.lynch.category,
    provider,
    ag1, ag2, ag3, ag4,
    totalTimeSec,
    allParsed,
  };
}

// ── Main ──

async function main() {
  console.log(`${'═'.repeat(70)}`);
  console.log(`  PROVIDER COMPARISON: Local Qwen 3.5 vs Anthropic Haiku/Sonnet`);
  console.log(`  Companies: ${count} | Full 4-agent pipeline`);
  console.log(`${'═'.repeat(70)}\n`);

  // Instantiate both clients
  const localClient = new OpenAICompatibleClient();
  const anthropicClient = new AnthropicClient();

  if (!anthropicClient.isAvailable()) {
    console.error('ANTHROPIC_API_KEY not set — cannot run Anthropic pipeline');
    process.exit(1);
  }

  console.log(`Local: ${config.LOCAL_LLM_MODEL} @ ${config.LOCAL_LLM_URL} (temp=${config.LOCAL_LLM_TEMPERATURE})`);
  console.log(`Anthropic: claude-haiku-4-5 (AG1-3) + claude-sonnet-4-5 (AG4)\n`);

  // Layer 1 scoring (shared)
  const rubric = loadRubric();
  // Load more than needed so we get enough with enriched data
  const { analyses, enrichedMap } = await scoreAllCompanies(6, rubric);

  // Filter to companies that have enriched data + framework results
  const eligible = analyses.filter(a => enrichedMap.has(a.companyId) && a.frameworkResults);
  const companies = eligible.slice(0, count);

  console.log(`Selected ${companies.length} companies:`);
  companies.forEach((a, i) =>
    console.log(`  ${i + 1}. ${a.companyName} (${a.screenerCode}) — L1=${a.compositeScore}, lynch=${a.frameworkResults?.lynch.category}`),
  );

  const localResults: CompanyResult[] = [];
  const anthropicResults: CompanyResult[] = [];

  // ── Run pipelines ──

  for (const analysis of companies) {
    const enriched = enrichedMap.get(analysis.companyId)!;

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${analysis.companyName} (${analysis.screenerCode}) — L1 score: ${analysis.compositeScore}`);
    console.log(`${'─'.repeat(70)}`);

    // Local first
    console.log(`\n  [LOCAL] Running 4-agent pipeline...`);
    const localRes = await runFullPipeline(localClient, 'local', analysis, enriched);
    localResults.push(localRes);
    printCompanyBrief(localRes);

    // Then Anthropic
    console.log(`\n  [ANTHROPIC] Running 4-agent pipeline...`);
    const anthRes = await runFullPipeline(anthropicClient, 'anthropic', analysis, enriched);
    anthropicResults.push(anthRes);
    printCompanyBrief(anthRes);

    // Quick delta
    printDelta(localRes, anthRes);
  }

  // ── Analysis ──

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ANALYSIS`);
  console.log(`${'═'.repeat(70)}`);

  printParseRateAnalysis(localResults, anthropicResults);
  printTimingAnalysis(localResults, anthropicResults);
  printAssessmentAgreement(localResults, anthropicResults);
  printAdjustmentAnalysis(localResults, anthropicResults);
  printConvictionAnalysis(localResults, anthropicResults);
  printOutputQuality(localResults, anthropicResults);
  printThesisComparison(localResults, anthropicResults);
  printVerdict(localResults, anthropicResults);

  process.exit(0);
}

// ── Print helpers ──

function printCompanyBrief(r: CompanyResult) {
  const parseStr = r.allParsed ? 'all parsed' : `FAILURES: ${[
    !r.ag1.call.parseSuccess && 'AG1',
    !r.ag2.call.parseSuccess && 'AG2',
    !r.ag3.call.parseSuccess && 'AG3',
    !r.ag4.call.parseSuccess && 'AG4',
  ].filter(Boolean).join(', ')}`;

  console.log(`    ${r.provider.toUpperCase()} — ${r.totalTimeSec.toFixed(1)}s total | ${parseStr}`);

  if (r.ag1.parsed) {
    console.log(`    AG1: trend=${r.ag1.parsed.trend_assessment}, quality=${r.ag1.parsed.earnings_quality}, adj=${r.ag1.parsed.adjustment}, conf=${r.ag1.parsed.confidence}`);
  }
  if (r.ag2.parsed) {
    console.log(`    AG2: gov=${r.ag2.parsed.governance_quality}, promoter=${r.ag2.parsed.promoter_assessment}, adj=${r.ag2.parsed.adjustment}`);
  }
  if (r.ag3.parsed) {
    console.log(`    AG3: risk=${r.ag3.parsed.overall_risk}, risks=${r.ag3.parsed.primary_risks.length}, adj=${r.ag3.parsed.adjustment}`);
  }
  if (r.ag4.parsed) {
    console.log(`    AG4: conviction=${r.ag4.parsed.conviction}, alignment=${r.ag4.parsed.signal_alignment}, adj=${r.ag4.parsed.final_adjustment}, horizon=${r.ag4.parsed.time_horizon}`);
  }
}

function printDelta(local: CompanyResult, anth: CompanyResult) {
  if (!local.ag4.parsed || !anth.ag4.parsed) return;
  const l = local.ag4.parsed;
  const a = anth.ag4.parsed;
  const adjDiff = Math.abs(l.final_adjustment - a.final_adjustment);
  console.log(`\n  Δ conviction: ${l.conviction === a.conviction ? 'AGREE' : `${l.conviction} vs ${a.conviction}`}`);
  console.log(`  Δ alignment: ${l.signal_alignment === a.signal_alignment ? 'AGREE' : `${l.signal_alignment} vs ${a.signal_alignment}`}`);
  console.log(`  Δ final adj: ${adjDiff} pts (local=${l.final_adjustment}, anth=${a.final_adjustment})`);
  console.log(`  Δ horizon: ${l.time_horizon === a.time_horizon ? 'AGREE' : `${l.time_horizon} vs ${a.time_horizon}`}`);
}

// ── Section 1: Parse Rates ──

function printParseRateAnalysis(local: CompanyResult[], anth: CompanyResult[]) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  1. PARSE RATES`);
  console.log(`${'─'.repeat(70)}`);

  for (const agent of ['ag1', 'ag2', 'ag3', 'ag4'] as const) {
    const lPass = local.filter(r => r[agent].call.parseSuccess).length;
    const aPass = anth.filter(r => r[agent].call.parseSuccess).length;
    const label = { ag1: 'AG1 Fundamentals', ag2: 'AG2 Governance', ag3: 'AG3 Risk', ag4: 'AG4 Synthesis' }[agent];
    console.log(`  ${label.padEnd(20)} Local: ${lPass}/${local.length}  Anthropic: ${aPass}/${anth.length}`);
  }

  const lTotal = local.filter(r => r.allParsed).length;
  const aTotal = anth.filter(r => r.allParsed).length;
  console.log(`  ${'All 4 agents'.padEnd(20)} Local: ${lTotal}/${local.length}  Anthropic: ${aTotal}/${anth.length}`);

  // List failures
  const lFails = local.filter(r => !r.allParsed);
  const aFails = anth.filter(r => !r.allParsed);
  if (lFails.length) {
    console.log(`\n  Local failures:`);
    for (const r of lFails) {
      for (const agent of ['ag1', 'ag2', 'ag3', 'ag4'] as const) {
        if (!r[agent].call.parseSuccess) {
          console.log(`    ${r.company} ${agent.toUpperCase()}: ${r[agent].call.error ?? 'parse failed'}`);
        }
      }
    }
  }
  if (aFails.length) {
    console.log(`\n  Anthropic failures:`);
    for (const r of aFails) {
      for (const agent of ['ag1', 'ag2', 'ag3', 'ag4'] as const) {
        if (!r[agent].call.parseSuccess) {
          console.log(`    ${r.company} ${agent.toUpperCase()}: ${r[agent].call.error ?? 'parse failed'}`);
        }
      }
    }
  }
}

// ── Section 2: Timing ──

function printTimingAnalysis(local: CompanyResult[], anth: CompanyResult[]) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  2. TIMING (seconds)`);
  console.log(`${'─'.repeat(70)}`);

  console.log(`\n  Per-company total:`);
  console.log(`  ${'Company'.padEnd(16)} ${'Local'.padStart(8)} ${'Anthropic'.padStart(10)} ${'Ratio'.padStart(8)}`);
  for (let i = 0; i < local.length; i++) {
    const l = local[i];
    const a = anth[i];
    const ratio = l.totalTimeSec / a.totalTimeSec;
    console.log(`  ${l.company.padEnd(16)} ${l.totalTimeSec.toFixed(1).padStart(8)} ${a.totalTimeSec.toFixed(1).padStart(10)} ${ratio.toFixed(1).padStart(7)}x`);
  }

  // Per-agent averages
  console.log(`\n  Per-agent averages:`);
  for (const agent of ['ag1', 'ag2', 'ag3', 'ag4'] as const) {
    const lAvg = local.reduce((s, r) => s + r[agent].call.timeSec, 0) / local.length;
    const aAvg = anth.reduce((s, r) => s + r[agent].call.timeSec, 0) / anth.length;
    const label = { ag1: 'AG1 Fundamentals', ag2: 'AG2 Governance', ag3: 'AG3 Risk', ag4: 'AG4 Synthesis' }[agent];
    console.log(`  ${label.padEnd(20)} Local: ${lAvg.toFixed(1)}s  Anthropic: ${aAvg.toFixed(1)}s  (${(lAvg / aAvg).toFixed(1)}x)`);
  }

  const lAvgTotal = local.reduce((s, r) => s + r.totalTimeSec, 0) / local.length;
  const aAvgTotal = anth.reduce((s, r) => s + r.totalTimeSec, 0) / anth.length;
  console.log(`  ${'TOTAL'.padEnd(20)} Local: ${lAvgTotal.toFixed(1)}s  Anthropic: ${aAvgTotal.toFixed(1)}s  (${(lAvgTotal / aAvgTotal).toFixed(1)}x)`);

  const lWall = local.reduce((s, r) => s + r.totalTimeSec, 0);
  const aWall = anth.reduce((s, r) => s + r.totalTimeSec, 0);
  console.log(`\n  Wall-clock total: Local ${lWall.toFixed(0)}s (${(lWall / 60).toFixed(1)}m) | Anthropic ${aWall.toFixed(0)}s (${(aWall / 60).toFixed(1)}m)`);
}

// ── Section 3: Assessment Agreement ──

function printAssessmentAgreement(local: CompanyResult[], anth: CompanyResult[]) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  3. ASSESSMENT AGREEMENT`);
  console.log(`${'─'.repeat(70)}`);

  const fields = [
    { name: 'AG1 trend', get: (r: CompanyResult) => r.ag1.parsed?.trend_assessment },
    { name: 'AG1 earnings_quality', get: (r: CompanyResult) => r.ag1.parsed?.earnings_quality },
    { name: 'AG1 growth_sustain', get: (r: CompanyResult) => r.ag1.parsed?.growth_sustainability },
    { name: 'AG1 confidence', get: (r: CompanyResult) => r.ag1.parsed?.confidence },
    { name: 'AG2 governance', get: (r: CompanyResult) => r.ag2.parsed?.governance_quality },
    { name: 'AG2 promoter', get: (r: CompanyResult) => r.ag2.parsed?.promoter_assessment },
    { name: 'AG2 institutional', get: (r: CompanyResult) => r.ag2.parsed?.institutional_signal },
    { name: 'AG3 overall_risk', get: (r: CompanyResult) => r.ag3.parsed?.overall_risk },
    { name: 'AG4 conviction', get: (r: CompanyResult) => r.ag4.parsed?.conviction },
    { name: 'AG4 alignment', get: (r: CompanyResult) => r.ag4.parsed?.signal_alignment },
    { name: 'AG4 horizon', get: (r: CompanyResult) => r.ag4.parsed?.time_horizon },
  ];

  console.log(`\n  ${'Field'.padEnd(22)} ${'Agree'.padStart(6)} ${'Total'.padStart(6)} ${'Rate'.padStart(6)}`);
  for (const f of fields) {
    let agree = 0;
    let total = 0;
    for (let i = 0; i < local.length; i++) {
      const lVal = f.get(local[i]);
      const aVal = f.get(anth[i]);
      if (lVal != null && aVal != null) {
        total++;
        if (lVal === aVal) agree++;
      }
    }
    const rate = total > 0 ? `${(agree / total * 100).toFixed(0)}%` : 'N/A';
    console.log(`  ${f.name.padEnd(22)} ${String(agree).padStart(6)} ${String(total).padStart(6)} ${rate.padStart(6)}`);
  }

  // Per-company detail for key fields
  console.log(`\n  Per-company categorical detail:`);
  console.log(`  ${'Company'.padEnd(12)} ${'Field'.padEnd(18)} ${'Local'.padEnd(16)} ${'Anthropic'.padEnd(16)} ${'Match'.padEnd(5)}`);
  for (let i = 0; i < local.length; i++) {
    const l = local[i];
    const a = anth[i];
    const keyFields = [
      { name: 'trend', lv: l.ag1.parsed?.trend_assessment, av: a.ag1.parsed?.trend_assessment },
      { name: 'risk', lv: l.ag3.parsed?.overall_risk, av: a.ag3.parsed?.overall_risk },
      { name: 'conviction', lv: l.ag4.parsed?.conviction, av: a.ag4.parsed?.conviction },
      { name: 'horizon', lv: l.ag4.parsed?.time_horizon, av: a.ag4.parsed?.time_horizon },
    ];
    for (const f of keyFields) {
      if (f.lv == null || f.av == null) continue;
      const match = f.lv === f.av ? 'Y' : 'N';
      console.log(`  ${l.company.padEnd(12)} ${f.name.padEnd(18)} ${f.lv.padEnd(16)} ${f.av.padEnd(16)} ${match}`);
    }
  }
}

// ── Section 4: Adjustment Spread ──

function printAdjustmentAnalysis(local: CompanyResult[], anth: CompanyResult[]) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  4. ADJUSTMENT ANALYSIS`);
  console.log(`${'─'.repeat(70)}`);

  console.log(`\n  Per-company agent adjustments:`);
  console.log(`  ${'Company'.padEnd(12)} ${'Agent'.padEnd(5)} ${'Local'.padStart(6)} ${'Anth'.padStart(6)} ${'Diff'.padStart(6)}`);

  const allDiffs: number[] = [];

  for (let i = 0; i < local.length; i++) {
    const l = local[i];
    const a = anth[i];

    const agents = [
      { name: 'AG1', la: l.ag1.parsed?.adjustment, aa: a.ag1.parsed?.adjustment },
      { name: 'AG2', la: l.ag2.parsed?.adjustment, aa: a.ag2.parsed?.adjustment },
      { name: 'AG3', la: l.ag3.parsed?.adjustment, aa: a.ag3.parsed?.adjustment },
      { name: 'AG4', la: l.ag4.parsed?.final_adjustment, aa: a.ag4.parsed?.final_adjustment },
    ];

    for (const ag of agents) {
      if (ag.la == null || ag.aa == null) continue;
      const diff = ag.la - ag.aa;
      allDiffs.push(Math.abs(diff));
      const sign = diff > 0 ? '+' : '';
      console.log(`  ${l.company.padEnd(12)} ${ag.name.padEnd(5)} ${String(ag.la).padStart(6)} ${String(ag.aa).padStart(6)} ${(sign + diff).padStart(6)}`);
    }
  }

  if (allDiffs.length > 0) {
    const avgDiff = allDiffs.reduce((s, d) => s + d, 0) / allDiffs.length;
    const maxDiff = Math.max(...allDiffs);
    const within2 = allDiffs.filter(d => d <= 2).length;
    const within5 = allDiffs.filter(d => d <= 5).length;
    console.log(`\n  Absolute difference stats:`);
    console.log(`    Mean: ${avgDiff.toFixed(1)} pts`);
    console.log(`    Max:  ${maxDiff} pts`);
    console.log(`    Within 2 pts: ${within2}/${allDiffs.length} (${(within2 / allDiffs.length * 100).toFixed(0)}%)`);
    console.log(`    Within 5 pts: ${within5}/${allDiffs.length} (${(within5 / allDiffs.length * 100).toFixed(0)}%)`);
  }

  // Final score impact
  console.log(`\n  Final score impact (L1 + AG4 adjustment):`);
  console.log(`  ${'Company'.padEnd(12)} ${'L1'.padStart(4)} ${'L adj'.padStart(6)} ${'L final'.padStart(8)} ${'A adj'.padStart(6)} ${'A final'.padStart(8)} ${'Δ final'.padStart(8)}`);
  for (let i = 0; i < local.length; i++) {
    const l = local[i];
    const a = anth[i];
    const lAdj = l.ag4.parsed?.final_adjustment ?? 0;
    const aAdj = a.ag4.parsed?.final_adjustment ?? 0;
    const lFinal = l.compositeScore + lAdj;
    const aFinal = a.compositeScore + aAdj;
    const delta = lFinal - aFinal;
    const sign = delta > 0 ? '+' : '';
    console.log(`  ${l.company.padEnd(12)} ${String(l.compositeScore).padStart(4)} ${String(lAdj).padStart(6)} ${String(lFinal).padStart(8)} ${String(aAdj).padStart(6)} ${String(aFinal).padStart(8)} ${(sign + delta).padStart(8)}`);
  }
}

// ── Section 5: Conviction ──

function printConvictionAnalysis(local: CompanyResult[], anth: CompanyResult[]) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  5. CONVICTION & SIGNAL ALIGNMENT`);
  console.log(`${'─'.repeat(70)}`);

  console.log(`\n  ${'Company'.padEnd(12)} ${'L conv'.padEnd(10)} ${'A conv'.padEnd(10)} ${'L align'.padEnd(14)} ${'A align'.padEnd(14)}`);
  for (let i = 0; i < local.length; i++) {
    const l = local[i];
    const a = anth[i];
    const lConv = l.ag4.parsed?.conviction ?? '—';
    const aConv = a.ag4.parsed?.conviction ?? '—';
    const lAlign = l.ag4.parsed?.signal_alignment ?? '—';
    const aAlign = a.ag4.parsed?.signal_alignment ?? '—';
    console.log(`  ${l.company.padEnd(12)} ${lConv.padEnd(10)} ${aConv.padEnd(10)} ${lAlign.padEnd(14)} ${aAlign.padEnd(14)}`);
  }

  // Conviction distribution
  const convLevels = ['high', 'medium', 'low', 'none'] as const;
  console.log(`\n  Conviction distribution:`);
  console.log(`  ${'Level'.padEnd(10)} ${'Local'.padStart(6)} ${'Anthropic'.padStart(10)}`);
  for (const level of convLevels) {
    const lCount = local.filter(r => r.ag4.parsed?.conviction === level).length;
    const aCount = anth.filter(r => r.ag4.parsed?.conviction === level).length;
    console.log(`  ${level.padEnd(10)} ${String(lCount).padStart(6)} ${String(aCount).padStart(10)}`);
  }
}

// ── Section 6: Output Quality ──

function printOutputQuality(local: CompanyResult[], anth: CompanyResult[]) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  6. OUTPUT QUALITY (character counts & detail density)`);
  console.log(`${'─'.repeat(70)}`);

  console.log(`\n  Average raw output length per agent:`);
  for (const agent of ['ag1', 'ag2', 'ag3', 'ag4'] as const) {
    const lAvg = local.reduce((s, r) => s + r[agent].call.rawLen, 0) / local.length;
    const aAvg = anth.reduce((s, r) => s + r[agent].call.rawLen, 0) / anth.length;
    const label = { ag1: 'AG1', ag2: 'AG2', ag3: 'AG3', ag4: 'AG4' }[agent];
    console.log(`  ${label.padEnd(5)} Local: ${lAvg.toFixed(0).padStart(5)} chars  Anthropic: ${aAvg.toFixed(0).padStart(5)} chars  (${(lAvg / aAvg).toFixed(2)}x)`);
  }

  // Key findings count
  console.log(`\n  Average key_findings per agent:`);
  const lAg1Findings = local.filter(r => r.ag1.parsed).map(r => r.ag1.parsed!.key_findings.length);
  const aAg1Findings = anth.filter(r => r.ag1.parsed).map(r => r.ag1.parsed!.key_findings.length);
  const lAg3Risks = local.filter(r => r.ag3.parsed).map(r => r.ag3.parsed!.primary_risks.length);
  const aAg3Risks = anth.filter(r => r.ag3.parsed).map(r => r.ag3.parsed!.primary_risks.length);
  const lAg4Monitor = local.filter(r => r.ag4.parsed).map(r => r.ag4.parsed!.key_monitor_items.length);
  const aAg4Monitor = anth.filter(r => r.ag4.parsed).map(r => r.ag4.parsed!.key_monitor_items.length);

  const avg = (arr: number[]) => arr.length ? (arr.reduce((s, n) => s + n, 0) / arr.length).toFixed(1) : 'N/A';
  console.log(`  AG1 key_findings:     Local: ${avg(lAg1Findings)}  Anthropic: ${avg(aAg1Findings)}`);
  console.log(`  AG3 primary_risks:    Local: ${avg(lAg3Risks)}  Anthropic: ${avg(aAg3Risks)}`);
  console.log(`  AG4 monitor_items:    Local: ${avg(lAg4Monitor)}  Anthropic: ${avg(aAg4Monitor)}`);

  // Red flags and positive signals
  const lRedFlags = local.filter(r => r.ag1.parsed).map(r => r.ag1.parsed!.red_flags.length);
  const aRedFlags = anth.filter(r => r.ag1.parsed).map(r => r.ag1.parsed!.red_flags.length);
  const lPosSig = local.filter(r => r.ag1.parsed).map(r => r.ag1.parsed!.positive_signals.length);
  const aPosSig = anth.filter(r => r.ag1.parsed).map(r => r.ag1.parsed!.positive_signals.length);
  console.log(`  AG1 red_flags:        Local: ${avg(lRedFlags)}  Anthropic: ${avg(aRedFlags)}`);
  console.log(`  AG1 positive_signals: Local: ${avg(lPosSig)}  Anthropic: ${avg(aPosSig)}`);
}

// ── Section 7: Thesis Comparison ──

function printThesisComparison(local: CompanyResult[], anth: CompanyResult[]) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  7. INVESTMENT THESIS COMPARISON (AG4 — first 200 chars)`);
  console.log(`${'─'.repeat(70)}`);

  for (let i = 0; i < local.length; i++) {
    const l = local[i];
    const a = anth[i];
    console.log(`\n  ${l.companyName} (${l.company}):`);
    console.log(`    Local:     ${l.ag4.parsed?.investment_thesis.slice(0, 200) ?? 'N/A'}...`);
    console.log(`    Anthropic: ${a.ag4.parsed?.investment_thesis.slice(0, 200) ?? 'N/A'}...`);

    // Category verdict
    if (l.ag4.parsed?.category_verdict || a.ag4.parsed?.category_verdict) {
      console.log(`    L verdict: ${l.ag4.parsed?.category_verdict.slice(0, 150) ?? 'N/A'}`);
      console.log(`    A verdict: ${a.ag4.parsed?.category_verdict.slice(0, 150) ?? 'N/A'}`);
    }
  }
}

// ── Section 8: Verdict ──

function printVerdict(local: CompanyResult[], anth: CompanyResult[]) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  VERDICT`);
  console.log(`${'═'.repeat(70)}`);

  // Compute summary stats
  const lParseRate = local.filter(r => r.allParsed).length / local.length;
  const aParseRate = anth.filter(r => r.allParsed).length / anth.length;
  const lAvgTime = local.reduce((s, r) => s + r.totalTimeSec, 0) / local.length;
  const aAvgTime = anth.reduce((s, r) => s + r.totalTimeSec, 0) / anth.length;

  // Agreement on key classifications
  let convictionAgree = 0;
  let trendAgree = 0;
  let riskAgree = 0;
  let comparable = 0;
  for (let i = 0; i < local.length; i++) {
    if (local[i].allParsed && anth[i].allParsed) {
      comparable++;
      if (local[i].ag4.parsed!.conviction === anth[i].ag4.parsed!.conviction) convictionAgree++;
      if (local[i].ag1.parsed!.trend_assessment === anth[i].ag1.parsed!.trend_assessment) trendAgree++;
      if (local[i].ag3.parsed!.overall_risk === anth[i].ag3.parsed!.overall_risk) riskAgree++;
    }
  }

  console.log(`\n  Metric               Local               Anthropic`);
  console.log(`  Parse rate:          ${(lParseRate * 100).toFixed(0)}%                 ${(aParseRate * 100).toFixed(0)}%`);
  console.log(`  Avg time/company:    ${lAvgTime.toFixed(1)}s              ${aAvgTime.toFixed(1)}s`);
  console.log(`  Cost/company:        ~$0 (local)          ~$0.01-0.05 (API)`);

  if (comparable > 0) {
    console.log(`\n  Cross-provider agreement (${comparable} companies with full parses):`);
    console.log(`    Trend assessment:  ${trendAgree}/${comparable} (${(trendAgree / comparable * 100).toFixed(0)}%)`);
    console.log(`    Risk level:        ${riskAgree}/${comparable} (${(riskAgree / comparable * 100).toFixed(0)}%)`);
    console.log(`    Conviction:        ${convictionAgree}/${comparable} (${(convictionAgree / comparable * 100).toFixed(0)}%)`);
  }
}

main().catch((err) => {
  console.error(`Failed: ${(err as Error).message}`);
  process.exit(1);
});
