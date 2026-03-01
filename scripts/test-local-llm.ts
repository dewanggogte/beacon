/**
 * Quick test: call the local LLM with a real agent prompt and check output.
 * Usage: LLM_PROVIDER=local npx tsx scripts/test-local-llm.ts
 */
import { config, logger } from '@screener/shared';
import { createLlmClient } from '../packages/analyzer/src/llm/create-llm-client.js';
import { FUNDAMENTALS_SYSTEM_PROMPT, parseFundamentalsOutput } from '../packages/analyzer/src/llm/agents/fundamentals-agent.js';

async function main() {
  console.log(`LLM_PROVIDER=${config.LLM_PROVIDER}`);
  console.log(`LOCAL_LLM_URL=${config.LOCAL_LLM_URL}`);
  console.log(`LOCAL_LLM_MODEL=${config.LOCAL_LLM_MODEL}`);

  const client = createLlmClient();
  if (!client.isAvailable()) {
    console.error('Client not available');
    process.exit(1);
  }

  // Test: Real fundamentals agent prompt with fake data
  console.log('\n=== Test: Real Fundamentals Agent Prompt ===');
  const fakeDataPack = `Company: TCS (Tata Consultancy Services)
Lynch Category: stalwart
Composite Score: 72/100

Key Ratios: P/E=28, P/B=12, ROE=45%, ROCE=55%, D/E=0.05
Buffett Score: 8/10 (PASS: ROE>15%, OPM stable, low debt, consistent growth)
Graham Score: 3/10 (FAIL: P/E>15, P/B>1.5)

Revenue (Cr): FY19=146463, FY20=156949, FY21=164177, FY22=191754, FY23=225458, FY24=240000
OPM%: FY19=25.6, FY20=25.0, FY21=26.8, FY22=25.0, FY23=24.4, FY24=24.2
Net Profit (Cr): FY19=31472, FY20=32430, FY21=32562, FY22=38327, FY23=42147, FY24=45000
OCF (Cr): FY19=28742, FY20=30852, FY21=35634, FY22=36910, FY23=41200, FY24=43000`;

  const start = Date.now();
  const raw = await client.generate(FUNDAMENTALS_SYSTEM_PROMPT, fakeDataPack, {
    maxTokens: 1024,
    cacheSystemPrompt: true,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`Time: ${elapsed}s`);
  console.log(`Output length: ${raw.length} chars`);
  console.log(`Starts with '{': ${raw.startsWith('{')}`);
  console.log(`Contains '<think>': ${raw.includes('<think>')}`);
  console.log(`Contains 'Thinking': ${raw.startsWith('Thinking')}`);
  console.log('\nRaw output:');
  console.log(raw);

  // Parse with the real parser
  const parsed = parseFundamentalsOutput(raw);
  if (parsed) {
    console.log('\n=== PARSE SUCCESS ===');
    console.log('trend_assessment:', parsed.trend_assessment);
    console.log('earnings_quality:', parsed.earnings_quality);
    console.log('adjustment:', parsed.adjustment);
    console.log('confidence:', parsed.confidence);
    console.log('key_findings:', parsed.key_findings);
    console.log('red_flags:', parsed.red_flags);
    console.log('positive_signals:', parsed.positive_signals);
  } else {
    console.error('\n=== PARSE FAILED ===');
    console.log('The parser returned null. Check if output contains valid JSON.');
  }
}

main().catch(console.error);
