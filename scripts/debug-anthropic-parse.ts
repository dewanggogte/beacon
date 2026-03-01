/**
 * Debug: dump raw Anthropic AG1 + AG3 output to diagnose parse failures.
 */
import { AnthropicClient } from '../packages/analyzer/src/llm/anthropic-client.js';
import { loadRubric } from '../packages/analyzer/src/scoring/rubric-loader.js';
import { scoreAllCompanies } from '../packages/analyzer/src/scoring/engine.js';
import { buildFundamentalsDataPack, buildRiskDataPack } from '../packages/analyzer/src/llm/agents/data-pack-builder.js';
import { FUNDAMENTALS_SYSTEM_PROMPT, parseFundamentalsOutput } from '../packages/analyzer/src/llm/agents/fundamentals-agent.js';
import { RISK_SYSTEM_PROMPT, parseRiskOutput } from '../packages/analyzer/src/llm/agents/risk-agent.js';

async function main() {
  const client = new AnthropicClient();
  const rubric = loadRubric();
  const { analyses, enrichedMap } = await scoreAllCompanies(6, rubric);
  const a = analyses[0];
  const enriched = enrichedMap.get(a.companyId)!;
  const fr = a.frameworkResults!;

  console.log(`Company: ${a.companyName} (${a.screenerCode})\n`);

  // AG1
  console.log('=== AG1 FUNDAMENTALS ===');
  const fundUser = buildFundamentalsDataPack(a, enriched, fr);
  const fundRaw = await client.generate(FUNDAMENTALS_SYSTEM_PROMPT, fundUser, { maxTokens: 1024, cacheSystemPrompt: true });
  console.log('Raw output:');
  console.log(fundRaw);
  console.log(`\nLength: ${fundRaw.length}`);
  const fundParsed = parseFundamentalsOutput(fundRaw);
  console.log(`Parse: ${fundParsed ? 'SUCCESS' : 'FAIL'}`);
  if (!fundParsed) {
    const jsonMatch = fundRaw.match(/\{[\s\S]*\}/);
    console.log(`Regex match: ${!!jsonMatch}`);
    if (jsonMatch) {
      try {
        JSON.parse(jsonMatch[0]);
        console.log('JSON.parse: SUCCESS');
      } catch (e) {
        console.log(`JSON.parse FAIL: ${(e as Error).message}`);
        console.log(`Match preview (500): ${jsonMatch[0].slice(0, 500)}`);
      }
    }
  }

  // AG3
  console.log('\n\n=== AG3 RISK ===');
  const riskUser = buildRiskDataPack(a, enriched, fr);
  const riskRaw = await client.generate(RISK_SYSTEM_PROMPT, riskUser, { maxTokens: 1024, cacheSystemPrompt: true });
  console.log('Raw output:');
  console.log(riskRaw);
  console.log(`\nLength: ${riskRaw.length}`);
  const riskParsed = parseRiskOutput(riskRaw);
  console.log(`Parse: ${riskParsed ? 'SUCCESS' : 'FAIL'}`);
  if (!riskParsed) {
    const jsonMatch = riskRaw.match(/\{[\s\S]*\}/);
    console.log(`Regex match: ${!!jsonMatch}`);
    if (jsonMatch) {
      try {
        JSON.parse(jsonMatch[0]);
        console.log('JSON.parse: SUCCESS');
      } catch (e) {
        console.log(`JSON.parse FAIL: ${(e as Error).message}`);
        console.log(`Match preview (500): ${jsonMatch[0].slice(0, 500)}`);
      }
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
