/**
 * Diagnostic: capture full LLM input/output for N companies.
 * Logs input sizes, raw responses, parse results, timing, and quality checks.
 * Usage: LLM_PROVIDER=local npx tsx scripts/diagnose-llm.ts [count]
 */
import { config, logger } from '@screener/shared';
import { createLlmClient } from '../packages/analyzer/src/llm/create-llm-client.js';
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

const count = parseInt(process.argv[2] ?? '3', 10);

interface CallLog {
  agent: string;
  company: string;
  systemPromptLen: number;
  userMsgLen: number;
  totalInputChars: number;
  rawOutputLen: number;
  startsWithBrace: boolean;
  containsThinkTag: boolean;
  containsThinkingText: boolean;
  parseSuccess: boolean;
  parsedKeys: string[];
  elapsedSec: number;
  rawPreview: string;
  rawTail: string;
}

async function main() {
  console.log(`=== LLM DIAGNOSTIC (${count} companies) ===`);
  console.log(`Provider: ${config.LLM_PROVIDER}`);
  console.log(`Model: ${config.LOCAL_LLM_MODEL}`);
  console.log(`URL: ${config.LOCAL_LLM_URL}\n`);

  const client = createLlmClient();
  if (!client.isAvailable()) {
    console.error('Client not available');
    process.exit(1);
  }

  // Layer 1
  const rubric = loadRubric();
  const { analyses, enrichedMap } = await scoreAllCompanies(6, rubric);
  const companies = analyses.slice(0, count);

  console.log(`\nTesting ${companies.length} companies:`);
  companies.forEach((a, i) => console.log(`  ${i + 1}. ${a.companyName} (${a.screenerCode}) — score=${a.compositeScore}, lynch=${a.frameworkResults?.lynch.category}`));

  const allLogs: CallLog[] = [];

  for (const analysis of companies) {
    const enriched = enrichedMap.get(analysis.companyId);
    const fr = analysis.frameworkResults;
    if (!enriched || !fr) { console.log(`  Skipping ${analysis.screenerCode} — no enriched data`); continue; }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`COMPANY: ${analysis.companyName} (${analysis.screenerCode})`);
    console.log(`${'='.repeat(60)}`);

    // AG1: Fundamentals
    const fundSys = FUNDAMENTALS_SYSTEM_PROMPT;
    const fundUser = buildFundamentalsDataPack(analysis, enriched, fr);
    console.log(`\n--- AG1 FUNDAMENTALS ---`);
    console.log(`System prompt: ${fundSys.length} chars`);
    console.log(`User data pack: ${fundUser.length} chars`);
    console.log(`Total input: ${fundSys.length + fundUser.length} chars`);

    const s1 = Date.now();
    const fundRaw = await client.generate(fundSys, fundUser, { maxTokens: 1024, cacheSystemPrompt: true });
    const t1 = (Date.now() - s1) / 1000;
    const fundParsed = parseFundamentalsOutput(fundRaw);

    const log1: CallLog = {
      agent: 'AG1-Fundamentals', company: analysis.screenerCode,
      systemPromptLen: fundSys.length, userMsgLen: fundUser.length,
      totalInputChars: fundSys.length + fundUser.length,
      rawOutputLen: fundRaw.length,
      startsWithBrace: fundRaw.trimStart().startsWith('{'),
      containsThinkTag: fundRaw.includes('<think>') || fundRaw.includes('</think>'),
      containsThinkingText: fundRaw.includes('Thinking Process:') || fundRaw.includes('thinking process'),
      parseSuccess: fundParsed !== null,
      parsedKeys: fundParsed ? Object.keys(fundParsed) : [],
      elapsedSec: t1,
      rawPreview: fundRaw.slice(0, 300),
      rawTail: fundRaw.slice(-200),
    };
    allLogs.push(log1);
    printLog(log1);
    if (fundParsed) {
      console.log(`  Parsed values: trend=${fundParsed.trend_assessment}, quality=${fundParsed.earnings_quality}, adj=${fundParsed.adjustment}, conf=${fundParsed.confidence}`);
      console.log(`  Key findings (${fundParsed.key_findings.length}): ${fundParsed.key_findings[0]?.slice(0, 100) ?? 'none'}`);
      console.log(`  Red flags (${fundParsed.red_flags.length}): ${fundParsed.red_flags[0]?.slice(0, 100) ?? 'none'}`);
    }

    // AG2: Governance
    const govSys = GOVERNANCE_SYSTEM_PROMPT;
    const govUser = buildGovernanceDataPack(analysis, enriched, fr);
    console.log(`\n--- AG2 GOVERNANCE ---`);
    console.log(`System prompt: ${govSys.length} chars | User data pack: ${govUser.length} chars`);

    const s2 = Date.now();
    const govRaw = await client.generate(govSys, govUser, { maxTokens: 1024, cacheSystemPrompt: true });
    const t2 = (Date.now() - s2) / 1000;
    const govParsed = parseGovernanceOutput(govRaw);

    const log2: CallLog = {
      agent: 'AG2-Governance', company: analysis.screenerCode,
      systemPromptLen: govSys.length, userMsgLen: govUser.length,
      totalInputChars: govSys.length + govUser.length,
      rawOutputLen: govRaw.length,
      startsWithBrace: govRaw.trimStart().startsWith('{'),
      containsThinkTag: govRaw.includes('<think>') || govRaw.includes('</think>'),
      containsThinkingText: govRaw.includes('Thinking Process:'),
      parseSuccess: govParsed !== null,
      parsedKeys: govParsed ? Object.keys(govParsed) : [],
      elapsedSec: t2,
      rawPreview: govRaw.slice(0, 300),
      rawTail: govRaw.slice(-200),
    };
    allLogs.push(log2);
    printLog(log2);
    if (govParsed) {
      console.log(`  Parsed: gov=${govParsed.governance_quality}, promoter=${govParsed.promoter_assessment}, inst=${govParsed.institutional_signal}, adj=${govParsed.adjustment}`);
    }

    // AG3: Risk
    const riskSys = RISK_SYSTEM_PROMPT;
    const riskUser = buildRiskDataPack(analysis, enriched, fr);
    console.log(`\n--- AG3 RISK ---`);
    console.log(`System prompt: ${riskSys.length} chars | User data pack: ${riskUser.length} chars`);

    const s3 = Date.now();
    const riskRaw = await client.generate(riskSys, riskUser, { maxTokens: 1024, cacheSystemPrompt: true });
    const t3 = (Date.now() - s3) / 1000;
    const riskParsed = parseRiskOutput(riskRaw);

    const log3: CallLog = {
      agent: 'AG3-Risk', company: analysis.screenerCode,
      systemPromptLen: riskSys.length, userMsgLen: riskUser.length,
      totalInputChars: riskSys.length + riskUser.length,
      rawOutputLen: riskRaw.length,
      startsWithBrace: riskRaw.trimStart().startsWith('{'),
      containsThinkTag: riskRaw.includes('<think>') || riskRaw.includes('</think>'),
      containsThinkingText: riskRaw.includes('Thinking Process:'),
      parseSuccess: riskParsed !== null,
      parsedKeys: riskParsed ? Object.keys(riskParsed) : [],
      elapsedSec: t3,
      rawPreview: riskRaw.slice(0, 300),
      rawTail: riskRaw.slice(-200),
    };
    allLogs.push(log3);
    printLog(log3);
    if (riskParsed) {
      console.log(`  Parsed: overall=${riskParsed.overall_risk}, risks=${riskParsed.primary_risks.length}, adj=${riskParsed.adjustment}`);
      console.log(`  Tail risk: ${riskParsed.tail_risk.slice(0, 120)}`);
    }

    // AG4: Synthesis
    const synthSys = buildSynthesisSystemPrompt(fr.lynch.category);
    const synthUser = buildSynthesisDataPack(analysis, enriched, fr, fundRaw, govRaw, riskRaw);
    console.log(`\n--- AG4 SYNTHESIS ---`);
    console.log(`System prompt: ${synthSys.length} chars | User data pack: ${synthUser.length} chars (includes AG1-3 outputs)`);

    const s4 = Date.now();
    const synthRaw = await client.generate(synthSys, synthUser, { maxTokens: 1500, cacheSystemPrompt: true });
    const t4 = (Date.now() - s4) / 1000;
    const synthParsed = parseSynthesisOutput(synthRaw);

    const log4: CallLog = {
      agent: 'AG4-Synthesis', company: analysis.screenerCode,
      systemPromptLen: synthSys.length, userMsgLen: synthUser.length,
      totalInputChars: synthSys.length + synthUser.length,
      rawOutputLen: synthRaw.length,
      startsWithBrace: synthRaw.trimStart().startsWith('{'),
      containsThinkTag: synthRaw.includes('<think>') || synthRaw.includes('</think>'),
      containsThinkingText: synthRaw.includes('Thinking Process:'),
      parseSuccess: synthParsed !== null,
      parsedKeys: synthParsed ? Object.keys(synthParsed) : [],
      elapsedSec: t4,
      rawPreview: synthRaw.slice(0, 300),
      rawTail: synthRaw.slice(-200),
    };
    allLogs.push(log4);
    printLog(log4);
    if (synthParsed) {
      console.log(`  Parsed: conviction=${synthParsed.conviction}, alignment=${synthParsed.signal_alignment}, adj=${synthParsed.final_adjustment}, horizon=${synthParsed.time_horizon}`);
      console.log(`  Thesis: ${synthParsed.investment_thesis.slice(0, 200)}`);
    }

    const companyTotal = t1 + t2 + t3 + t4;
    console.log(`\n  TOTAL TIME for ${analysis.screenerCode}: ${companyTotal.toFixed(1)}s`);
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);

  const totalCalls = allLogs.length;
  const parseSuccesses = allLogs.filter(l => l.parseSuccess).length;
  const withThinkTags = allLogs.filter(l => l.containsThinkTag).length;
  const withThinkingText = allLogs.filter(l => l.containsThinkingText).length;
  const startsCorrectly = allLogs.filter(l => l.startsWithBrace).length;
  const avgTime = allLogs.reduce((s, l) => s + l.elapsedSec, 0) / totalCalls;
  const avgInputChars = allLogs.reduce((s, l) => s + l.totalInputChars, 0) / totalCalls;
  const avgOutputChars = allLogs.reduce((s, l) => s + l.rawOutputLen, 0) / totalCalls;
  const totalTime = allLogs.reduce((s, l) => s + l.elapsedSec, 0);

  console.log(`Total calls: ${totalCalls}`);
  console.log(`Parse success: ${parseSuccesses}/${totalCalls} (${(parseSuccesses/totalCalls*100).toFixed(0)}%)`);
  console.log(`Starts with '{': ${startsCorrectly}/${totalCalls}`);
  console.log(`Contains <think> tags: ${withThinkTags}/${totalCalls}`);
  console.log(`Contains 'Thinking Process:' text: ${withThinkingText}/${totalCalls}`);
  console.log(`Avg input: ${avgInputChars.toFixed(0)} chars (~${(avgInputChars/4).toFixed(0)} tokens)`);
  console.log(`Avg output: ${avgOutputChars.toFixed(0)} chars (~${(avgOutputChars/4).toFixed(0)} tokens)`);
  console.log(`Avg time/call: ${avgTime.toFixed(1)}s`);
  console.log(`Total time: ${totalTime.toFixed(1)}s`);

  // Per-agent breakdown
  for (const agentName of ['AG1-Fundamentals', 'AG2-Governance', 'AG3-Risk', 'AG4-Synthesis']) {
    const agentLogs = allLogs.filter(l => l.agent === agentName);
    if (agentLogs.length === 0) continue;
    const success = agentLogs.filter(l => l.parseSuccess).length;
    const avg = agentLogs.reduce((s, l) => s + l.elapsedSec, 0) / agentLogs.length;
    const avgIn = agentLogs.reduce((s, l) => s + l.totalInputChars, 0) / agentLogs.length;
    const avgOut = agentLogs.reduce((s, l) => s + l.rawOutputLen, 0) / agentLogs.length;
    console.log(`  ${agentName}: ${success}/${agentLogs.length} parsed, avg ${avg.toFixed(1)}s, in=${avgIn.toFixed(0)}ch out=${avgOut.toFixed(0)}ch`);
  }

  // Failures
  const failures = allLogs.filter(l => !l.parseSuccess);
  if (failures.length > 0) {
    console.log(`\n--- FAILURES ---`);
    for (const f of failures) {
      console.log(`${f.agent} / ${f.company}:`);
      console.log(`  Output len: ${f.rawOutputLen} | Starts with '{': ${f.startsWithBrace}`);
      console.log(`  Think tags: ${f.containsThinkTag} | Thinking text: ${f.containsThinkingText}`);
      console.log(`  Preview: ${f.rawPreview.slice(0, 200)}`);
      console.log(`  Tail: ${f.rawTail}`);
    }
  }

  process.exit(0);
}

function printLog(log: CallLog) {
  console.log(`  Output: ${log.rawOutputLen} chars | Time: ${log.elapsedSec.toFixed(1)}s | Parsed: ${log.parseSuccess ? 'YES' : 'FAIL'}`);
  console.log(`  Starts with '{': ${log.startsWithBrace} | Think tags: ${log.containsThinkTag} | Thinking text: ${log.containsThinkingText}`);
  if (!log.startsWithBrace) {
    console.log(`  First 150 chars: ${log.rawPreview.slice(0, 150)}`);
  }
}

main().catch((err) => {
  console.error(`Failed: ${(err as Error).message}`);
  process.exit(1);
});
