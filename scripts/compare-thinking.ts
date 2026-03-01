/**
 * Compare Qwen 3.5 non-thinking vs thinking mode on AG1 (Fundamentals).
 * Runs 5 companies through both modes and prints a side-by-side comparison.
 *
 * Usage: LLM_PROVIDER=local npx tsx scripts/compare-thinking.ts [count]
 *
 * This script calls the OpenAI SDK directly — it does NOT go through the
 * LlmClient interface, so both modes can be tested without changing client code.
 * Read-only: no DB writes, no pipeline side effects.
 */
import OpenAI from 'openai';
import { config } from '@screener/shared';
import { loadRubric } from '../packages/analyzer/src/scoring/rubric-loader.js';
import { scoreAllCompanies } from '../packages/analyzer/src/scoring/engine.js';
import { buildFundamentalsDataPack } from '../packages/analyzer/src/llm/agents/data-pack-builder.js';
import {
  FUNDAMENTALS_SYSTEM_PROMPT,
  parseFundamentalsOutput,
} from '../packages/analyzer/src/llm/agents/fundamentals-agent.js';

const count = parseInt(process.argv[2] ?? '5', 10);

interface RunResult {
  company: string;
  mode: 'non-thinking' | 'thinking';
  timeSec: number;
  rawLenBeforeStrip: number;
  rawLen: number;
  parseSuccess: boolean;
  trendAssessment: string | null;
  adjustment: number | null;
  confidence: string | null;
  firstFinding: string | null;
  error: string | null;
}

async function main() {
  console.log(`=== THINKING vs NON-THINKING COMPARISON (${count} companies) ===`);
  console.log(`Model: ${config.LOCAL_LLM_MODEL}`);
  console.log(`URL: ${config.LOCAL_LLM_URL}`);
  console.log(`Temperature: ${config.LOCAL_LLM_TEMPERATURE}\n`);

  const client = new OpenAI({
    baseURL: config.LOCAL_LLM_URL + '/v1',
    apiKey: 'not-needed',
  });

  // Layer 1 scoring to get company data
  const rubric = loadRubric();
  const { analyses, enrichedMap } = await scoreAllCompanies(6, rubric);
  const companies = analyses.slice(0, count);

  console.log(`Testing ${companies.length} companies:`);
  companies.forEach((a, i) =>
    console.log(`  ${i + 1}. ${a.companyName} (${a.screenerCode}) — score=${a.compositeScore}, lynch=${a.frameworkResults?.lynch.category}`),
  );

  const results: RunResult[] = [];

  for (const analysis of companies) {
    const enriched = enrichedMap.get(analysis.companyId);
    const fr = analysis.frameworkResults;
    if (!enriched || !fr) {
      console.log(`  Skipping ${analysis.screenerCode} — no enriched data`);
      continue;
    }

    const userMsg = buildFundamentalsDataPack(analysis, enriched, fr);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${analysis.companyName} (${analysis.screenerCode})`);
    console.log(`${'─'.repeat(60)}`);

    // ── Non-thinking mode ──
    console.log('\n  [NON-THINKING] ...');
    const ntResult = await runCall(client, userMsg, false, analysis.screenerCode);
    results.push(ntResult);
    printResult(ntResult);

    // ── Thinking mode ──
    console.log('\n  [THINKING] ...');
    const tResult = await runCall(client, userMsg, true, analysis.screenerCode);
    results.push(tResult);
    printResult(tResult);

    // Quick comparison
    if (ntResult.parseSuccess && tResult.parseSuccess) {
      const sameAssessment = ntResult.trendAssessment === tResult.trendAssessment;
      const adjDiff = Math.abs((ntResult.adjustment ?? 0) - (tResult.adjustment ?? 0));
      console.log(`\n  Δ assessment: ${sameAssessment ? 'SAME' : `DIFFER (${ntResult.trendAssessment} vs ${tResult.trendAssessment})`}`);
      console.log(`  Δ adjustment: ${adjDiff} pts`);
    }
  }

  // ── Summary table ──
  console.log(`\n${'═'.repeat(70)}`);
  console.log('SUMMARY TABLE');
  console.log(`${'═'.repeat(70)}`);

  const ntResults = results.filter(r => r.mode === 'non-thinking');
  const tResults = results.filter(r => r.mode === 'thinking');

  // Header
  console.log(`${'Company'.padEnd(16)} ${'Mode'.padEnd(14)} ${'Time'.padStart(6)} ${'Len'.padStart(6)} ${'Parse'.padStart(6)} ${'Trend'.padEnd(14)} ${'Adj'.padStart(4)} ${'Conf'.padEnd(8)}`);
  console.log('─'.repeat(70));

  for (const r of results) {
    console.log(
      `${r.company.padEnd(16)} ${r.mode.padEnd(14)} ${r.timeSec.toFixed(1).padStart(6)} ${String(r.rawLen).padStart(6)} ${(r.parseSuccess ? 'YES' : 'FAIL').padStart(6)} ${(r.trendAssessment ?? '—').padEnd(14)} ${String(r.adjustment ?? '—').padStart(4)} ${(r.confidence ?? '—').padEnd(8)}`,
    );
  }

  // Aggregates
  console.log('─'.repeat(70));

  const ntParsed = ntResults.filter(r => r.parseSuccess).length;
  const tParsed = tResults.filter(r => r.parseSuccess).length;
  const ntAvgTime = ntResults.reduce((s, r) => s + r.timeSec, 0) / (ntResults.length || 1);
  const tAvgTime = tResults.reduce((s, r) => s + r.timeSec, 0) / (tResults.length || 1);
  const ntAvgLen = ntResults.reduce((s, r) => s + r.rawLen, 0) / (ntResults.length || 1);
  const tAvgLen = tResults.reduce((s, r) => s + r.rawLen, 0) / (tResults.length || 1);

  console.log(`\n  Non-thinking: ${ntParsed}/${ntResults.length} parsed, avg ${ntAvgTime.toFixed(1)}s, avg ${ntAvgLen.toFixed(0)} chars`);
  console.log(`  Thinking:     ${tParsed}/${tResults.length} parsed, avg ${tAvgTime.toFixed(1)}s, avg ${tAvgLen.toFixed(0)} chars`);
  console.log(`  Speed ratio:  thinking is ${(tAvgTime / ntAvgTime).toFixed(1)}x slower`);

  // Agreement analysis
  let agreements = 0;
  let comparisons = 0;
  for (const nt of ntResults) {
    const t = tResults.find(r => r.company === nt.company);
    if (t && nt.parseSuccess && t.parseSuccess) {
      comparisons++;
      if (nt.trendAssessment === t.trendAssessment) agreements++;
    }
  }
  if (comparisons > 0) {
    console.log(`  Assessment agreement: ${agreements}/${comparisons} (${(agreements / comparisons * 100).toFixed(0)}%)`);
  }

  process.exit(0);
}

async function runCall(
  client: OpenAI,
  userMsg: string,
  thinking: boolean,
  company: string,
): Promise<RunResult> {
  const mode = thinking ? 'thinking' : 'non-thinking';

  try {
    const start = Date.now();

    const extraParams: Record<string, unknown> = thinking
      ? { chat_template_kwargs: { enable_thinking: true } }
      : { chat_template_kwargs: { enable_thinking: false } };

    const response = await client.chat.completions.create({
      model: config.LOCAL_LLM_MODEL,
      max_tokens: thinking ? 12288 : 1024,
      temperature: thinking ? 0.6 : config.LOCAL_LLM_TEMPERATURE,
      top_p: 0.8,
      presence_penalty: thinking ? 0 : 1.5,
      messages: [
        { role: 'system', content: FUNDAMENTALS_SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      // @ts-expect-error — SGLang-specific field
      ...extraParams,
    });

    const elapsed = (Date.now() - start) / 1000;
    const fullRaw = response.choices[0]?.message?.content ?? '';
    let raw = fullRaw;

    // Strip thinking block if present
    const thinkEnd = raw.lastIndexOf('</think>');
    if (thinkEnd !== -1) {
      raw = raw.slice(thinkEnd + '</think>'.length).trim();
    }

    const parsed = parseFundamentalsOutput(raw);

    return {
      company,
      mode,
      timeSec: elapsed,
      rawLenBeforeStrip: fullRaw.length,
      rawLen: raw.length,
      parseSuccess: parsed !== null,
      trendAssessment: parsed?.trend_assessment ?? null,
      adjustment: parsed?.adjustment ?? null,
      confidence: parsed?.confidence ?? null,
      firstFinding: parsed?.key_findings[0]?.slice(0, 100) ?? null,
      error: null,
    };
  } catch (err) {
    return {
      company,
      mode,
      timeSec: 0,
      rawLenBeforeStrip: 0,
      rawLen: 0,
      parseSuccess: false,
      trendAssessment: null,
      adjustment: null,
      confidence: null,
      firstFinding: null,
      error: (err as Error).message,
    };
  }
}

function printResult(r: RunResult) {
  if (r.error) {
    console.log(`    ERROR: ${r.error}`);
    return;
  }
  const stripInfo = r.rawLenBeforeStrip !== r.rawLen ? ` (${r.rawLenBeforeStrip} before strip)` : '';
  console.log(`    Time: ${r.timeSec.toFixed(1)}s | Output: ${r.rawLen} chars${stripInfo} | Parse: ${r.parseSuccess ? 'YES' : 'FAIL'}`);
  if (r.parseSuccess) {
    console.log(`    Trend: ${r.trendAssessment} | Adj: ${r.adjustment} | Conf: ${r.confidence}`);
    console.log(`    Finding: ${r.firstFinding}`);
  }
}

main().catch((err) => {
  console.error(`Failed: ${(err as Error).message}`);
  process.exit(1);
});
